import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Camera, CameraOff, FlipHorizontal, RefreshCw } from 'lucide-react'
import {
  detectFacesInVideo,
  isFrameWorthSending,
  loadFaceDetector,
  type FrameDetection,
} from '../../lib/faceDetector'

export interface WebcamCaptureHandle {
  captureSnapshot: (notify?: boolean) => string | undefined
  getVideoElement: () => HTMLVideoElement | null
  isCameraActive: () => boolean
  startCamera: () => Promise<void>
  stopCamera: () => void
  /** Latest in-browser detection, or null when the local detector is unavailable. */
  getLatestDetection: () => FrameDetection | null
  /** True once the local detector has loaded (false = server fallback). */
  hasLocalDetector: () => boolean
}

/** Colour/label of the live face box, driven by the latest server verdict. */
export interface FaceOverlayStatus {
  tone: 'scanning' | 'success' | 'warning' | 'danger'
  label?: string
}

const OVERLAY_COLORS: Record<FaceOverlayStatus['tone'], string> = {
  scanning: '#f59e0b', // amber: analysing
  success: '#10b981', // emerald: recognised
  warning: '#f59e0b', // amber: not matched / adjust position
  danger: '#f43f5e', // rose: spoof suspected / low light
}
const DETECTION_INTERVAL_MS = 120
// Frames sent to the server are downscaled to this width and JPEG-compressed.
const MAX_UPLOAD_WIDTH = 640
const UPLOAD_JPEG_QUALITY = 0.8

export interface WebcamCaptureProps {
  isScanning?: boolean
  onCaptureFrame?: (dataUrl: string) => void | Promise<void>
  autoCapture?: boolean
  captureIntervalMs?: number
  showScanLine?: boolean
  showOverlays?: boolean
  hideDefaultOval?: boolean
  showControls?: boolean
  onCameraError?: (message: string) => void
  onCameraReady?: () => void
  label?: string
  sublabel?: string
  overlayText?: string
  children?: React.ReactNode
  /** Run the in-browser detector; autoCapture then only uploads frames with one usable face. */
  gateWithFaceDetector?: boolean
  /** Draw live bounding boxes over the video. */
  showFaceBoxes?: boolean
  faceOverlay?: FaceOverlayStatus | null
}

export const WebcamCapture = forwardRef<WebcamCaptureHandle, WebcamCaptureProps>(
  function WebcamCapture(
    {
      isScanning = false,
      onCaptureFrame,
      autoCapture = false,
      captureIntervalMs = 1800,
      showScanLine = true,
      showOverlays = true,
      hideDefaultOval = false,
      showControls = true,
      onCameraError,
      onCameraReady,
      label = 'Camera trực tiếp',
      sublabel = 'Đặt khuôn mặt vào giữa khung hình',
      overlayText = 'Camera HD · Khung quét khuôn mặt',
      children,
      gateWithFaceDetector = false,
      showFaceBoxes = false,
      faceOverlay = null,
    },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const detectionRef = useRef<FrameDetection | null>(null)
    const localDetectorRef = useRef(false)
    const overlayRef = useRef<FaceOverlayStatus | null>(faceOverlay)
    useEffect(() => {
      overlayRef.current = faceOverlay
    }, [faceOverlay])
    const [cameraActive, setCameraActive] = useState<boolean>(false)
    const [hasPermissionError, setHasPermissionError] = useState<boolean>(false)
    // The preview is a mirror by default; captured pixels remain native for AI.
    const [mirrorPreview, setMirrorPreview] = useState(true)

    const startCamera = async () => {
      try {
        setHasPermissionError(false)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        })
        if (videoRef.current) {
          streamRef.current?.getTracks().forEach((track) => track.stop())
          streamRef.current = stream
          videoRef.current.srcObject = stream
          videoRef.current.play()
          setCameraActive(true)
          onCameraReady?.()
        }
      } catch (err) {
        console.warn('Webcam not available or permission denied:', err)
        setHasPermissionError(true)
        setCameraActive(false)
        onCameraError?.('Webcam access was denied or is unavailable.')
      }
    }

    const stopCamera = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setCameraActive(false)
    }

    useEffect(() => {
      startCamera()
      return () => {
        stopCamera()
      }
    }, [])

    const captureSnapshot = (notify = true): string | undefined => {
      if (videoRef.current && cameraActive) {
        const canvas = document.createElement('canvas')
        const sourceWidth = videoRef.current.videoWidth || 640
        const sourceHeight = videoRef.current.videoHeight || 480
        const scale = Math.min(1, MAX_UPLOAD_WIDTH / sourceWidth)
        canvas.width = Math.round(sourceWidth * scale)
        canvas.height = Math.round(sourceHeight * scale)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', UPLOAD_JPEG_QUALITY)
          if (notify) onCaptureFrame?.(dataUrl)
          return dataUrl
        }
      }
      onCameraError?.('Webcam is not ready for capture.')
      return undefined
    }

    // Local detection loop: feeds the capture gate and the bounding-box overlay.
    const needsDetector = gateWithFaceDetector || showFaceBoxes
    useEffect(() => {
      if (!needsDetector || !cameraActive) return
      let cancelled = false
      let timer: number | undefined
      const draw = (detection: FrameDetection | null) => {
        const canvas = canvasRef.current
        const video = videoRef.current
        if (!canvas || !video) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (!showFaceBoxes || !detection) return
        const status = overlayRef.current
        const color = status ? OVERLAY_COLORS[status.tone] : '#2dd4bf'
        const lineWidth = Math.max(2, canvas.width / 320)
        const fontSize = Math.max(12, canvas.width / 40)
        ctx.lineWidth = lineWidth
        ctx.strokeStyle = color
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`
        detection.faces.forEach((face) => {
          const [left, top, right, bottom] = face.bbox
          // The preview is mirrored with CSS; mirror the box coordinates instead
          // of the canvas so labels stay readable.
          const x = mirrorPreview ? canvas.width - right : left
          const width = right - left
          ctx.beginPath()
          ctx.roundRect(x, top, width, bottom - top, lineWidth * 4)
          ctx.stroke()
          if (status?.label && detection.face_count === 1) {
            const padding = lineWidth * 2
            const textWidth = ctx.measureText(status.label).width
            const labelHeight = fontSize + padding * 2
            const labelY = Math.max(0, top - labelHeight - lineWidth)
            ctx.fillStyle = color
            ctx.fillRect(x, labelY, textWidth + padding * 2, labelHeight)
            ctx.fillStyle = '#ffffff'
            ctx.textBaseline = 'top'
            ctx.fillText(status.label, x + padding, labelY + padding)
          }
        })
      }
      void loadFaceDetector().then((detector) => {
        if (cancelled || !detector) return
        localDetectorRef.current = true
        const tick = () => {
          if (cancelled) return
          const video = videoRef.current
          const detection = video ? detectFacesInVideo(detector, video) : null
          detectionRef.current = detection
          draw(detection)
          timer = window.setTimeout(tick, DETECTION_INTERVAL_MS)
        }
        tick()
      })
      return () => {
        cancelled = true
        if (timer) window.clearTimeout(timer)
        detectionRef.current = null
        draw(null)
      }
    }, [needsDetector, cameraActive, showFaceBoxes, mirrorPreview])

    useEffect(() => {
      if (!autoCapture || !cameraActive || !onCaptureFrame) return
      let cancelled = false
      let inFlight = false
      const captureForScan = async () => {
        if (cancelled || inFlight) return
        // Gate: without exactly one usable face in view, do not upload anything.
        // If the local detector failed to load, frames are sent as before.
        if (gateWithFaceDetector && localDetectorRef.current) {
          const video = videoRef.current
          const detection = detectionRef.current
          if (!video || !detection || !isFrameWorthSending(detection, video.videoWidth, video.videoHeight)) return
        }
        const frame = captureSnapshot(false)
        if (!frame) return
        inFlight = true
        try {
          await onCaptureFrame(frame)
        } finally {
          inFlight = false
        }
      }
      const timer = window.setInterval(() => { void captureForScan() }, captureIntervalMs)
      void captureForScan()
      return () => {
        cancelled = true
        window.clearInterval(timer)
      }
    }, [autoCapture, cameraActive, captureIntervalMs, onCaptureFrame, gateWithFaceDetector])

    useImperativeHandle(ref, () => ({
      captureSnapshot,
      getVideoElement: () => videoRef.current,
      isCameraActive: () => cameraActive,
      startCamera,
      stopCamera,
      getLatestDetection: () => detectionRef.current,
      hasLocalDetector: () => localDetectorRef.current,
    }))

    return (
      <div className="flex flex-col items-center w-full">
        {/* Camera viewport */}
        <div
          className="relative w-full overflow-hidden rounded-xl bg-slate-900"
          style={{ aspectRatio: '4/3', minHeight: 300 }}
        >
          {/* Scan line overlay */}
          {showOverlays && (isScanning || showScanLine) && cameraActive && (
            <div
              className="animate-scanline absolute left-0 right-0 h-0.5 bg-teal-400/70 z-10 pointer-events-none"
              style={{ top: '50%' }}
            />
          )}

          {/* Default Oval face guide if not hidden */}
          {showOverlays && cameraActive && !hideDefaultOval && (
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              <div
                style={{
                  width: '55%',
                  aspectRatio: '3/4',
                  border: '2px solid rgba(20,143,131,0.7)',
                  borderRadius: '50%',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                }}
              />
            </div>
          )}

          {/* Child custom overlay (arrows, interactive guides, status) */}
          {children && <div className="absolute inset-0 z-20 pointer-events-none">{children}</div>}

          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              display: cameraActive ? 'block' : 'none',
              transform: mirrorPreview ? 'scaleX(-1)' : 'none',
            }}
          />

          {needsDetector && (
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none"
              style={{ display: cameraActive ? 'block' : 'none' }}
            />
          )}

          {!cameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                <Camera size={32} className="text-slate-500" />
              </div>
              <span className="text-sm font-medium text-slate-300">
                {isScanning ? 'Đang phân tích khuôn mặt...' : label}
              </span>
              <small className="text-xs text-slate-500">
                {hasPermissionError
                  ? 'Không thể truy cập camera. Hãy cấp quyền rồi thử lại.'
                  : sublabel}
              </small>
            </div>
          )}

          {showOverlays && cameraActive && !children && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-slate-900/75 text-white text-[10px] px-3 py-1 rounded-full backdrop-blur-sm pointer-events-none">
              {overlayText}
            </div>
          )}

          {/* Corner brackets decoration */}
          {showOverlays && (
            <>
              <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-teal-400/60 rounded-tl pointer-events-none z-10" />
              <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-teal-400/60 rounded-tr pointer-events-none z-10" />
              <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-teal-400/60 rounded-bl pointer-events-none z-10" />
              <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-teal-400/60 rounded-br pointer-events-none z-10" />
            </>
          )}
        </div>

        {/* Camera controls */}
        {showControls && (
          <div className="flex flex-wrap gap-2 mt-3 items-center justify-center">
            {!cameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition"
              >
                <Camera size={13} /> Bật webcam
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-red-700 text-white transition"
              >
                <CameraOff size={13} /> Tắt webcam
              </button>
            )}
            {onCaptureFrame && (
              <button
                type="button"
                onClick={() => captureSnapshot()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white transition"
              >
                <RefreshCw size={13} /> Chụp mẫu
              </button>
            )}
            {cameraActive && (
              <button
                type="button"
                onClick={() => setMirrorPreview((value) => !value)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                aria-pressed={mirrorPreview}
                title="Chỉ lật khung xem; ảnh gửi AI không bị lật"
              >
                <FlipHorizontal size={13} /> {mirrorPreview ? 'Bỏ lật khung xem' : 'Lật khung xem'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }
)
