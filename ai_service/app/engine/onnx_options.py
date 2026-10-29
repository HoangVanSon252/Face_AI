import onnxruntime as ort

from app.core.config import settings


def session_options() -> ort.SessionOptions:
    options = ort.SessionOptions()
    if settings.ONNX_INTRA_OP_THREADS > 0:
        options.intra_op_num_threads = settings.ONNX_INTRA_OP_THREADS
        options.inter_op_num_threads = 1
    return options
