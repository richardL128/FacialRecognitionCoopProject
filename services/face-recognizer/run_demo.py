# File: run_demo.py
import argparse
from pathlib import Path
from typing import Tuple


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CAPTURE_ROOT = REPO_ROOT / "uploads" / "camera-captures"
DEFAULT_DATASET_ROOT = REPO_ROOT / "dataset"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare two faces using direct paths or employee storage layout.",
    )
    parser.add_argument("--img1", help="Path to first image file")
    parser.add_argument("--img2", help="Path to second image file")

    parser.add_argument("--tenant-id", help="Tenant UUID used in storage folders")
    parser.add_argument("--capture-id-1", help="First capture UUID (without .jpg)")
    parser.add_argument("--capture-id-2", help="Second capture UUID (without .jpg)")
    parser.add_argument("--capture-root", default=str(DEFAULT_CAPTURE_ROOT))

    parser.add_argument("--employee-id", help="Employee ID/class directory in dataset")
    parser.add_argument("--dataset-root", default=str(DEFAULT_DATASET_ROOT))

    return parser.parse_args()


def resolve_from_capture_storage(args: argparse.Namespace) -> Tuple[Path, Path]:
    capture_root = Path(args.capture_root)
    img1 = capture_root / args.tenant_id / f"{args.capture_id_1}.jpg"
    img2 = capture_root / args.tenant_id / f"{args.capture_id_2}.jpg"
    return img1, img2


def resolve_from_dataset(args: argparse.Namespace) -> Tuple[Path, Path]:
    dataset_root = Path(args.dataset_root)

    # Support both dataset/<tenant>/<employee>/ and dataset/<employee>/ layouts.
    if args.tenant_id:
        employee_dir = dataset_root / args.tenant_id / args.employee_id
    else:
        employee_dir = dataset_root / args.employee_id

    candidates = sorted(
        [
            p
            for p in employee_dir.iterdir()
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        ]
    )
    if len(candidates) < 2:
        raise ValueError(
            f"Expected at least 2 images in {employee_dir}, found {len(candidates)}"
        )

    return candidates[0], candidates[1]


def resolve_images(args: argparse.Namespace) -> Tuple[Path, Path]:
    if args.img1 and args.img2:
        return Path(args.img1), Path(args.img2)

    if args.tenant_id and args.capture_id_1 and args.capture_id_2:
        return resolve_from_capture_storage(args)

    if args.employee_id:
        return resolve_from_dataset(args)

    raise ValueError(
        "Provide either --img1/--img2, or --tenant-id with --capture-id-1/--capture-id-2, or --employee-id"
    )


def main() -> None:
    args = parse_args()
    img1_path, img2_path = resolve_images(args)

    if not img1_path.exists() or not img2_path.exists():
        raise FileNotFoundError(
            f"Missing file(s): {img1_path} exists={img1_path.exists()}, {img2_path} exists={img2_path.exists()}"
        )

    from inference import FaceAnalysis

    print("Initializing models...")
    app = FaceAnalysis()

    print(f"Comparing {img1_path} vs {img2_path}...")
    similarity, is_same = app.compare(str(img1_path), str(img2_path))

    print("-" * 30)
    print(f"Similarity Score: {similarity:.4f}")
    print("-" * 30)

    if is_same:
        print("RESULT: SAME PERSON")
    else:
        print("RESULT: DIFFERENT PERSON")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}")
        print(
            "Tip: pass --employee-id, or --tenant-id with capture IDs, or explicit --img1/--img2"
        )
