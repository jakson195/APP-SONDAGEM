"""Alinhamento espacial ECC (OpenCV)."""

from __future__ import annotations

import cv2
import numpy as np


def align_ecc_affine(reference: np.ndarray, moving: np.ndarray) -> np.ndarray:
    ref_gray = cv2.cvtColor((reference * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    mov_gray = cv2.cvtColor((moving * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(
            ref_gray,
            mov_gray,
            warp,
            cv2.MOTION_AFFINE,
            (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-5),
        )
        h, w = ref_gray.shape
        aligned = cv2.warpAffine(
            (moving * 255).astype(np.uint8),
            warp,
            (w, h),
            flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
        )
        return aligned.astype(np.float32) / 255.0
    except cv2.error:
        return moving
