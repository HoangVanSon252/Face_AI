import type { FaceDetector as MediaPipeFaceDetector } from '@mediapipe/tasks-vision'

/**
 * In-browser face detection (MediaPipe BlazeFace, WASM) used only to decide
 * *when* a webcam frame is worth sending to the server. Recognition and
 * anti-spoofing stay server-side. Results use the same shape as the server's
 * /face/detect-frame response so callers can fall back to it transparently.
 */
export interface DetectedFace {
  /** [left, top, right, bottom] in video pixels (unmirrored). */
  bbox: number[]
  confidence: number
  /** InsightFace-compatible order: eye (image-left), eye (image-right), nose, mouth, mouth. */
  landmarks: number[][]
}

export interface FrameDetection {
  face_count: number
  faces: DetectedFace[]
}

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/blaze_face_short_range.tflite'

let detectorPromise: Promise<MediaPipeFaceDetector | null> | null = null
let lastTimestamp = 0

/** Lazily loads the detector once per page; resolves to null if unsupported. */
export function loadFaceDetector(): Promise<MediaPipeFaceDetector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
        return await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        })
      } catch (error) {
        console.warn('Local face detector unavailable; falling back to server checks.', error)
        return null
      }
    })()
  }
  return detectorPromise
}

/** Detects faces on the current video frame. Returns null when the detector is unavailable. */
export function detectFacesInVideo(detector: MediaPipeFaceDetector, video: HTMLVideoElement): FrameDetection | null {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height || video.readyState < 2) return null
  // detectForVideo requires strictly increasing timestamps across calls.
  lastTimestamp = Math.max(performance.now(), lastTimestamp + 1)
  const result = detector.detectForVideo(video, lastTimestamp)
  const faces = result.detections.map((detection): DetectedFace => {
    const box = detection.boundingBox
    const left = box?.originX ?? 0
    const top = box?.originY ?? 0
    const points = (detection.keypoints ?? []).map((point) => [point.x * width, point.y * height])
    // BlazeFace keypoints: 0/1 eyes, 2 nose tip, 3 mouth centre, 4/5 ear tragions.
    const eyes = points.slice(0, 2).sort((a, b) => a[0] - b[0])
    const landmarks = points.length >= 4 ? [eyes[0], eyes[1], points[2], points[3], points[3]] : []
    return {
      bbox: [left, top, left + (box?.width ?? 0), top + (box?.height ?? 0)],
      confidence: detection.categories?.[0]?.score ?? 0,
      landmarks,
    }
  })
  return { face_count: faces.length, faces }
}

/**
 * Gate for automatic capture: exactly one confident face, large enough to be
 * recognised and roughly centred. Frames failing it are never uploaded.
 */
export function isFrameWorthSending(detection: FrameDetection, width: number, height: number): boolean {
  if (detection.face_count !== 1) return false
  const face = detection.faces[0]
  const [left, top, right, bottom] = face.bbox
  const faceWidth = right - left
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  return (
    face.confidence >= 0.7 &&
    faceWidth >= width * 0.15 &&
    Math.abs(centerX - width / 2) <= width * 0.3 &&
    Math.abs(centerY - height / 2) <= height * 0.35
  )
}
