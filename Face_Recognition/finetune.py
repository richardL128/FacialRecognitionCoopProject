import argparse
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms, datasets
import torchvision.models as models
from torch.utils.data import DataLoader, random_split
from tqdm import tqdm
import os
import numpy as np


# ==========================================
# 1. MODEL ARCHITECTURE
# ==========================================
class FaceRecognitionModel(nn.Module):
    def __init__(self):
        super(FaceRecognitionModel, self).__init__()
        # Load backbone
        print("🏗️ Loading Backbone: Wide ResNet-101-2...")
        self.backbone = models.wide_resnet101_2(weights='IMAGENET1K_V2')
        self.backbone.fc = nn.Identity()

        # Embedding Head
        self.embed = nn.Sequential(
            nn.Linear(2048, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(inplace=True)
        )

    def forward(self, img):
        features = self.backbone(img)
        embedding = self.embed(features)
        # Normalize to hypersphere
        return F.normalize(embedding, p=2, dim=1)


# ==========================================
# 2. LOSS FUNCTIONS
# ==========================================
class ArcFaceLoss(nn.Module):
    def __init__(self, num_classes, embedding_size=512, margin=0.5, scale=64):
        super(ArcFaceLoss, self).__init__()
        self.margin = margin
        self.scale = scale
        self.weight = nn.Parameter(torch.Tensor(num_classes, embedding_size))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, embeddings, labels):
        W = F.normalize(self.weight, dim=1)
        x = F.normalize(embeddings, dim=1)

        cosine = torch.matmul(x, W.t())
        cosine = cosine.clamp(-1 + 1e-7, 1 - 1e-7)

        theta = torch.acos(cosine)
        target_logits = torch.cos(theta + self.margin)

        one_hot = torch.zeros_like(cosine)
        one_hot.scatter_(1, labels.view(-1, 1), 1.0)

        output = cosine * (1 - one_hot) + target_logits * one_hot
        output = output * self.scale
        return output


class CenterLoss(nn.Module):
    def __init__(self, num_classes, embedding_size=512):
        super(CenterLoss, self).__init__()
        self.centers = nn.Parameter(torch.randn(num_classes, embedding_size))
        nn.init.xavier_uniform_(self.centers)

    def forward(self, embeddings, labels):
        centers_norm = F.normalize(self.centers, p=2, dim=1)
        centers_batch = centers_norm[labels]
        cosine_sim = (embeddings * centers_batch).sum(dim=1)
        loss = (1.0 - cosine_sim).mean()
        return loss


# ==========================================
# 3. DATA LOADER
# ==========================================
def get_dataloader(data_dir, batch_size=64, num_workers=4, split_ratio=0.9):
    print(f"📂 Loading Data from: {data_dir}")

    # Strong Augmentation for Training
    transform_train = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomCrop((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.25, hue=0.08),
        transforms.RandomGrayscale(p=0.1),
        transforms.RandomRotation(degrees=10),
        transforms.RandomAffine(degrees=0, translate=(0.08, 0.08), scale=(0.92, 1.08)),
        transforms.RandomApply([transforms.GaussianBlur(kernel_size=5, sigma=(0.1, 2.0))], p=0.3),
        transforms.RandomPerspective(distortion_scale=0.2, p=0.3),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        transforms.RandomErasing(p=0.25, scale=(0.02, 0.15), ratio=(0.3, 3.3)),
    ])

    # Standard Transform for Validation
    transform_val = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    full_dataset = datasets.ImageFolder(root=data_dir, transform=transform_train)
    num_classes = len(full_dataset.classes)

    # Split Train/Val
    train_size = int(split_ratio * len(full_dataset))
    val_size = len(full_dataset) - train_size
    train_set, val_set = random_split(full_dataset, [train_size, val_size], generator=torch.Generator().manual_seed(42))

    # Apply specific transform to validation set
    val_set.dataset.transform = transform_val

    print(f"   ✅ Classes: {num_classes}")
    print(f"   ✅ Train Images: {len(train_set)}")
    print(f"   ✅ Val Images: {len(val_set)}")

    train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=True)
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=True)

    return train_loader, val_loader, num_classes


# ==========================================
# 4. TRAINING ENGINE
# ==========================================
def evaluate(model, arcface, val_loader, criterion, device):
    model.eval()
    arcface.eval()
    total_loss = 0
    correct = 0
    total = 0

    with torch.no_grad():
        for imgs, labels in tqdm(val_loader, desc="   🧪 Evaluating"):
            imgs, labels = imgs.to(device), labels.to(device)
            embeddings = model(imgs)
            logits = arcface(embeddings, labels)
            loss = criterion(logits, labels)

            total_loss += loss.item()
            _, predicted = torch.max(logits.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()

    return total_loss / len(val_loader), 100 * correct / total


def main(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🚀 Device: {device}")

    # Data
    train_loader, val_loader, num_classes = get_dataloader(args.data_dir, args.batch_size, args.num_workers)

    # Models
    model = FaceRecognitionModel().to(device)
    arcface = ArcFaceLoss(num_classes=num_classes).to(device)
    center_loss = CenterLoss(num_classes=num_classes).to(device)

    # Load Checkpoint (Resume)
    start_epoch = 0
    if args.resume and os.path.exists(args.resume):
        print(f"🔄 Resuming from {args.resume}...")
        checkpoint = torch.load(args.resume, map_location=device)
        model.load_state_dict(checkpoint['model_state_dict'])
        arcface.load_state_dict(checkpoint['arcface_state_dict'])
        if 'center_loss_state_dict' in checkpoint:
            center_loss.load_state_dict(checkpoint['center_loss_state_dict'])
        start_epoch = checkpoint.get('epoch', 0)

    # Optimizer
    optimizer = torch.optim.Adam([
        {'params': model.backbone.parameters(), 'lr': args.lr_backbone},
        {'params': model.embed.parameters(), 'lr': args.lr_head},
        {'params': arcface.parameters(), 'lr': args.lr_head},
        {'params': center_loss.parameters(), 'lr': 1e-4}
    ], weight_decay=1e-3)

    criterion = nn.CrossEntropyLoss()
    best_acc = 0.0

    # Training Loop
    print("\n🔥 START TRAINING...")
    for epoch in range(start_epoch, args.epochs):
        model.train()
        total_loss = 0

        pbar = tqdm(train_loader, desc=f"Epoch {epoch + 1}/{args.epochs}")
        for imgs, labels in pbar:
            imgs, labels = imgs.to(device), labels.to(device)

            # Forward
            embeddings = model(imgs)
            logits = arcface(embeddings, labels)

            # Loss Calculation
            loss_ce = criterion(logits, labels)
            loss_center = center_loss(embeddings, labels)
            loss = loss_ce + (args.lambda_center * loss_center)

            # Backward
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            pbar.set_postfix({'Loss': f"{loss.item():.4f}", 'CE': f"{loss_ce.item():.4f}"})

        # Save Checkpoint
        save_dict = {
            'epoch': epoch + 1,
            'model_state_dict': model.state_dict(),
            'arcface_state_dict': arcface.state_dict(),
            'center_loss_state_dict': center_loss.state_dict(),
            'num_classes': num_classes
        }

        # Save Last
        torch.save(save_dict, os.path.join(args.output_dir, "last_checkpoint.bin"))

        # Evaluate & Save Best
        val_loss, val_acc = evaluate(model, arcface, val_loader, criterion, device)
        print(f"   🏆 Epoch {epoch + 1} | Val Loss: {val_loss:.4f} | Accuracy: {val_acc:.2f}%")

        if val_acc > best_acc:
            best_acc = val_acc
            print(f"   💾 Saving New Best Model (Acc: {best_acc:.2f}%)")
            torch.save(save_dict, os.path.join(args.output_dir, "pytorch_model.bin"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Face Recognition Model (ArcFace + CenterLoss)")

    # Required
    parser.add_argument('--data_dir', type=str, required=True, help="Path to ImageFolder dataset")

    # Optional
    parser.add_argument('--output_dir', type=str, default=".", help="Where to save .bin files")
    parser.add_argument('--resume', type=str, default=None, help="Path to checkpoint to resume")
    parser.add_argument('--epochs', type=int, default=20)
    parser.add_argument('--batch_size', type=int, default=64)
    parser.add_argument('--num_workers', type=int, default=4)

    # Hyperparameters
    parser.add_argument('--lr_backbone', type=float, default=8e-6)
    parser.add_argument('--lr_head', type=float, default=8e-5)
    parser.add_argument('--lambda_center', type=float, default=0.18)

    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    main(args)