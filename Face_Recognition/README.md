---
license: apache-2.0
language:
- en
pipeline_tag: image-classification
---
# 🧠 Face Recognition System (ArcFace + YOLOv8)

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![PyTorch](https://img.shields.io/badge/PyTorch-2.0%2B-orange)
![Status](https://img.shields.io/badge/Status-Stable-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 📖 Overview

This repository hosts a production-ready **Face Recognition Pipeline** designed for high-accuracy biometric identification. Unlike standard recognizers, this system integrates **YOLOv8** for robust face detection and alignment before feature extraction.

The core recognition model is built upon a **Wide ResNet-101-2** backbone, trained with a hybrid loss function (**ArcFace + Center Loss**) to generate highly discriminative 512-dimensional embeddings.

### 🌟 Key Features
- **Robust Detection**: Uses **YOLOv8 (ONNX)** to detect faces even in challenging lighting or angles.
- **High Accuracy**: Achieves **90.5%** accuracy on the LFW (Labeled Faces in the Wild) dataset and 90% on Validation.
- **Discriminative Embeddings**: 512-dim vectors optimized for Cosine Similarity.
- **Easy-to-Use API**: Includes a wrapper (`inference.py`) for 3-line code implementation.
- **Fine-tuning Ready**: Includes scripts to retrain the model on your custom dataset.

---

## 🛠️ Installation

To run the pipeline, you need to install the necessary dependencies. We recommend using a virtual environment.

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118  # For CUDA support
pip install opencv-python onnxruntime-gpu huggingface_hub pillow tqdm numpy
```
## Step 1: Download the Wrapper
- **Download our helper script inference.py which handles model downloading and YOLO detection automatically.**
```bash
wget https://huggingface.co/biometric-ai-lab/Face_Recognition/resolve/main/inference.py
``` 
---
## Step 2: Create & Run Python Script
- **Create a new file named run_demo.py.**
- **Copy and paste the code below into it.**
- **Make sure you have 2 images to test (e.g., face1.jpg and face2.jpg).**
```bash
# File: run_demo.py
from inference import FaceAnalysis

# 1. Initialize the AI (Downloads models automatically on first run)
print("⏳ Initializing models...")
app = FaceAnalysis()

# 2. Define your images
img1_path = "face1.jpg"  # <--- Change this to your image path
img2_path = "face2.jpg"  # <--- Change this to your image path

# 3. Run Comparison
print(f"🔍 Comparing {img1_path} vs {img2_path}...")

try:
    # Get similarity score and boolean result
    similarity, is_same = app.compare(img1_path, img2_path)

    print("-" * 30)
    print(f"🔹 Similarity Score: {similarity:.4f}")
    print("-" * 30)

    if is_same:
        print("✅ RESULT: SAME PERSON")
    else:
        print("❌ RESULT: DIFFERENT PERSON")

except Exception as e:
    print(f"Error: {e}")
    print("Tip: Make sure the image paths are correct!")
```
---
## 🎓 Training Guide
Option: Full Training (Advanced): Use train.py to train the model from scratch (ImageNet weights) on a large dataset.
**Step 1: Prepare Dataset**
- **Organize images in ImageFolder format**
```bash 
dataset/
├── person_1/
│   ├── img1.jpg
│   └── ...
└── person_2/
    └── img1.jpg
```
**Step 2: Run Training**
```bash 
python train.py \\
    --data_dir ./dataset \\
    --output_dir ./checkpoints \\
    --epochs 50 \\
    --batch_size 64 \\
    --lr_backbone 8e-6 \\
    --lr_head 8e-5
```
## 📘 About This Project
This project is developed by a group of undergraduate students  
from **Ho Chi Minh City University of Technology and Education (HCMUTE)**,  
**Cohort K23**, as part of academic research and learning activities.

---

## 📎 Vendoring note (added by PayEvo)

These files were previously a Gitlink in the parent repository, pointing at an
unregistered clone with no `.gitmodules` entry. They are now committed as plain
files inside the parent repo.

- Upstream: `https://huggingface.co/biometric-ai-lab/Face_Recognition`
- Copied from commit: `89cf83c08cbcaa44dfa5c0787db2765a7c07afd8` (`origin/main` at the time of vendoring)

`pytorch_model.bin` and `yolov8s-face-lindevs.onnx` are **not** committed. Upstream
tracks them with Git LFS; this repo does not use LFS. Both are downloaded from
Hugging Face at runtime by `hf_hub_download` — see `inference.py` and
`services/face-recognizer/inference.py`, which reads the repo id from `HF_REPO_ID`.
To fetch them by hand, install `git-lfs` and clone the upstream repo separately.