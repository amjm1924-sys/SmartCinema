import subprocess
import shutil

def get_video_codec():
    """
    Detects the best available encoder.
    Priority: HEVC NVENC > H264 NVENC > QSV (Intel) > AMF (AMD) > libx264 (CPU)
    """
    from ffmpeg_utils import get_ffmpeg_manager
    ffmpeg_path = get_ffmpeg_manager().get_ffmpeg_path()
    
    if not ffmpeg_path:
        return 'libx264'

    try:
        # Check encoders
        result = subprocess.run(
            [ffmpeg_path, '-encoders'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        output = result.stdout

        if 'hevc_nvenc' in output:
            print("Hardware Acceleration: Enabled (NVIDIA HEVC/H.265)")
            return 'hevc_nvenc'
        elif 'h264_nvenc' in output:
            print("Hardware Acceleration: Enabled (NVIDIA H.264)")
            return 'h264_nvenc'
        elif 'h264_qsv' in output:
            print("Hardware Acceleration: Enabled (Intel QSV)")
            return 'h264_qsv'
        elif 'h264_amf' in output:
            print("Hardware Acceleration: Enabled (AMD AMF)")
            return 'h264_amf'
        # elif 'h264_vaapi' in output: # Linux specific/complex setup
        #     return 'h264_vaapi'
        
    except Exception as e:
        print(f"Error detecting encoders: {e}")

    print("Hardware Acceleration: Not available (Using CPU)")
    return 'libx264'

def get_transcode_options(codec):
    """Returns FFmpeg flags optimized for the selected codec"""
    if codec == 'hevc_nvenc':
        return [
            '-c:v', 'hevc_nvenc',
            '-preset', 'p2',      # Fast preset, good balance
            '-tune', 'hq',
            '-rc', 'vbr',
            '-cq', '28',          # Target quality
            '-zerolatency', '1',  # Low latency
            '-tag:v', 'hvc1'      # Important for Apple device playback
        ]
    elif codec == 'h264_nvenc':
        return [
            '-c:v', 'h264_nvenc',
            '-preset', 'p2',      # Balanced speed
            '-tune', 'hq',
            '-rc', 'vbr',
            '-cq', '26',
            '-zerolatency', '1'   # Low latency
        ]
    elif codec == 'h264_qsv':
        return [
            '-c:v', 'h264_qsv',
            '-preset', 'veryfast',
            '-global_quality', '25'
        ]
    elif codec == 'h264_amf':
        return [
            '-c:v', 'h264_amf',
            '-quality', 'speed',   # AMD AMF optimal setting for live streaming
            '-rc', 'vbr_latency'   # Optimized for low latency VBR
        ]
    else: # libx264
        return [
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency'
        ]
