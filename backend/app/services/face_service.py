"""Face recognition utilities."""

import io
import math
from typing import List, Dict, Any, Tuple

try:
    import face_recognition
except Exception:  # pragma: no cover - optional dependency
    face_recognition = None


def _ensure_face_lib():
    if face_recognition is None:
        raise RuntimeError(
            "face-recognition library is not installed. "
            "Install dependencies from requirements.txt."
        )


def compute_face_embedding(image_bytes: bytes) -> List[float]:
    """Compute face embedding from image bytes. Returns list of floats."""
    _ensure_face_lib()
    image = face_recognition.load_image_file(io.BytesIO(image_bytes))
    encodings = face_recognition.face_encodings(image)
    if not encodings:
        raise ValueError("No face detected. Please use a clear face photo.")
    return encodings[0].tolist()


def compare_embeddings(known: List[float], candidate: List[float]) -> float:
    """Return face distance (lower is more similar)."""
    _ensure_face_lib()
    # Ensure numpy arrays for subtraction
    import numpy as np
    known_np = np.asarray(known, dtype="float32")
    cand_np = np.asarray(candidate, dtype="float32")
    distance = face_recognition.face_distance([known_np], cand_np)[0]
    return float(distance)


def _clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min_value, min(max_value, float(value)))


def _distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    return float(((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5)


def _mean_point(points: List[Tuple[float, float]]) -> Tuple[float, float]:
    if not points:
        return (0.0, 0.0)
    x = sum(point[0] for point in points) / len(points)
    y = sum(point[1] for point in points) / len(points)
    return (float(x), float(y))


def _eye_openness_ratio(eye_points: List[Tuple[float, float]]) -> float:
    # Approximate eye-aspect ratio with 6-point landmark format from dlib.
    if len(eye_points) < 6:
        return 0.0
    vertical = (_distance(eye_points[1], eye_points[5]) + _distance(eye_points[2], eye_points[4])) / 2.0
    horizontal = max(_distance(eye_points[0], eye_points[3]), 1e-6)
    return float(vertical / horizontal)


def _largest_face_index(face_locations: List[Tuple[int, int, int, int]]) -> int:
    def area(loc: Tuple[int, int, int, int]) -> int:
        top, right, bottom, left = loc
        return max((bottom - top) * (right - left), 0)

    largest_idx = 0
    largest_area = -1
    for index, location in enumerate(face_locations):
        current_area = area(location)
        if current_area > largest_area:
            largest_area = current_area
            largest_idx = index
    return largest_idx


def compute_visual_attention_features(image_bytes: bytes) -> Dict[str, Any]:
    """Estimate visual attention from face landmarks, head pose proxies, and frame context."""
    _ensure_face_lib()
    image = face_recognition.load_image_file(io.BytesIO(image_bytes))
    if image is None:
        return {
            "visual_attention": 0.0,
            "gaze_score": 0.0,
            "posture_score": 0.0,
            "head_pose_yaw": 0.0,
            "head_pose_pitch": 0.0,
            "head_roll": 0.0,
            "face_count": 0,
            "confidence": 0.0,
            "size_ratio": 0.0,
        }

    height, width = image.shape[:2]
    if not height or not width:
        return {
            "visual_attention": 0.0,
            "gaze_score": 0.0,
            "posture_score": 0.0,
            "head_pose_yaw": 0.0,
            "head_pose_pitch": 0.0,
            "head_roll": 0.0,
            "face_count": 0,
            "confidence": 0.0,
            "size_ratio": 0.0,
        }

    face_locations = face_recognition.face_locations(image)
    if not face_locations:
        return {
            "visual_attention": 0.0,
            "gaze_score": 0.0,
            "posture_score": 0.0,
            "head_pose_yaw": 0.0,
            "head_pose_pitch": 0.0,
            "head_roll": 0.0,
            "face_count": 0,
            "confidence": 0.0,
            "size_ratio": 0.0,
        }

    landmarks_all = face_recognition.face_landmarks(image, face_locations=face_locations)
    if not landmarks_all:
        return {
            "visual_attention": 0.0,
            "gaze_score": 0.0,
            "posture_score": 0.0,
            "head_pose_yaw": 0.0,
            "head_pose_pitch": 0.0,
            "head_roll": 0.0,
            "face_count": len(face_locations),
            "confidence": 0.0,
            "size_ratio": 0.0,
        }

    best_idx = _largest_face_index(face_locations)
    top, right, bottom, left = face_locations[best_idx]
    landmarks = landmarks_all[best_idx]

    face_area = max((bottom - top) * (right - left), 0)
    image_area = max(height * width, 1)
    size_ratio = face_area / image_area

    face_center_x = (left + right) / 2.0
    face_center_y = (top + bottom) / 2.0
    center_dx = abs((face_center_x / width) - 0.5)
    center_dy = abs((face_center_y / height) - 0.5)
    center_penalty = min((center_dx ** 2 + center_dy ** 2) ** 0.5 * 1.6, 1.0)

    left_eye_center = _mean_point(landmarks.get("left_eye", []))
    right_eye_center = _mean_point(landmarks.get("right_eye", []))
    nose_tip_center = _mean_point(landmarks.get("nose_tip", []))
    chin_points = landmarks.get("chin", [])

    if chin_points:
        jaw_left = chin_points[0]
        jaw_right = chin_points[-1]
        jaw_mid_x = (jaw_left[0] + jaw_right[0]) / 2.0
        half_jaw = max((jaw_right[0] - jaw_left[0]) / 2.0, 1.0)
        yaw_ratio = (nose_tip_center[0] - jaw_mid_x) / half_jaw
    else:
        yaw_ratio = 0.0

    eye_mid_y = (left_eye_center[1] + right_eye_center[1]) / 2.0
    chin_y = max((point[1] for point in chin_points), default=bottom)
    vertical_ref = max(chin_y - eye_mid_y, 1.0)
    head_mid_y = eye_mid_y + (vertical_ref / 2.0)
    pitch_ratio = (nose_tip_center[1] - head_mid_y) / (vertical_ref / 2.0)

    roll_radians = math.atan2((right_eye_center[1] - left_eye_center[1]), max((right_eye_center[0] - left_eye_center[0]), 1.0))
    roll_degrees = math.degrees(roll_radians)

    yaw_degrees = float(yaw_ratio * 35.0)
    pitch_degrees = float(pitch_ratio * 25.0)

    left_eye_openness = _eye_openness_ratio(landmarks.get("left_eye", []))
    right_eye_openness = _eye_openness_ratio(landmarks.get("right_eye", []))
    eye_openness = (left_eye_openness + right_eye_openness) / 2.0
    eye_score = _clamp((eye_openness - 0.16) / 0.14)

    yaw_penalty = min(abs(yaw_degrees) / 40.0, 1.0) * 0.35
    pitch_penalty = min(abs(pitch_degrees) / 30.0, 1.0) * 0.3
    roll_penalty = min(abs(roll_degrees) / 25.0, 1.0) * 0.15
    multi_face_penalty = 0.12 * max(len(face_locations) - 1, 0)

    size_score = _clamp((size_ratio - 0.03) / 0.1)
    posture_score = _clamp(1.0 - yaw_penalty - pitch_penalty - roll_penalty)
    gaze_score = _clamp((eye_score * 0.6) + ((1.0 - center_penalty) * 0.4))

    visual_attention = _clamp(
        (posture_score * 0.46)
        + (gaze_score * 0.36)
        + (size_score * 0.18)
        - multi_face_penalty
    )

    confidence = _clamp((size_score * 0.45) + (eye_score * 0.35) + (posture_score * 0.2))

    return {
        "visual_attention": round(visual_attention, 3),
        "gaze_score": round(gaze_score, 3),
        "posture_score": round(posture_score, 3),
        "head_pose_yaw": round(yaw_degrees, 2),
        "head_pose_pitch": round(pitch_degrees, 2),
        "head_roll": round(roll_degrees, 2),
        "face_count": len(face_locations),
        "confidence": round(confidence, 3),
        "size_ratio": round(size_ratio, 4),
    }


def compute_visual_attention(image_bytes: bytes) -> float:
    """Backward-compatible helper: returns only visual attention score."""
    features = compute_visual_attention_features(image_bytes)
    return float(features["visual_attention"])
