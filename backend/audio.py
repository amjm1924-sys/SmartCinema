"""
Audio processing module with real Whisper transcription and Edge-TTS synthesis.
"""
import os
import asyncio
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse
import whisper
import edge_tts

logger = logging.getLogger(__name__)
router = APIRouter()

# Directories for audio storage
UPLOAD_DIR = Path("./audio_uploads")
OUTPUT_DIR = Path("./audio_outputs")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Load Whisper model (using base model for speed on your hardware)
logger.info("Loading Whisper model...")
whisper_model = whisper.load_model("base")
logger.info("Whisper model loaded successfully")

# Edge-TTS voice for Arabic (you can change this)
EDGE_VOICE = "ar-EG-SalmaNeural"

async def synthesize_speech(text: str, output_path: Path) -> Path:
    """
    Synthesize speech from text using Edge-TTS.
    
    Args:
        text: Text to synthesize
        output_path: Path to save the audio file
        
    Returns:
        Path: Path to the generated audio file
    """
    try:
        communicate = edge_tts.Communicate(text, EDGE_VOICE)
        await communicate.save(str(output_path))
        logger.info(f"Synthesized audio saved to {output_path}")
        return output_path
    except Exception as e:
        logger.error(f"TTS synthesis error: {e}")
        raise

@router.post("/audio/upload")
async def upload_audio(file: UploadFile = File(...)):
    """
    Receive audio from mobile client, transcribe with Whisper,
    process with LLM, and return synthesized response.
    
    Workflow:
    1. Save uploaded audio
    2. Transcribe with Whisper
    3. Send transcription to Open Interpreter
    4. Synthesize response with Edge-TTS
    5. Return transcription, response text, and audio URL
    """
    try:
        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        logger.info(f"Audio saved: {file_path}")
        
        # Transcribe with Whisper
        logger.info("Transcribing audio...")
        result = whisper_model.transcribe(str(file_path), language="ar")
        transcription = result["text"].strip()
        logger.info(f"Transcription: {transcription}")
        
        if not transcription:
            raise HTTPException(status_code=400, detail="لم يتم التعرف على أي كلام")
        
        # Process with Open Interpreter
        from .interpreter import run_interpreter
        logger.info("Processing with interpreter...")
        llm_response = run_interpreter(transcription)
        
        # Synthesize response audio
        response_filename = f"response_{file.filename.split('.')[0]}.mp3"
        response_audio_path = OUTPUT_DIR / response_filename
        await synthesize_speech(llm_response, response_audio_path)
        
        # Clean up uploaded file to save space
        file_path.unlink(missing_ok=True)
        
        return JSONResponse({
            "transcription": transcription,
            "response": llm_response,
            "audio_url": f"/audio_output/{response_filename}"
        })
        
    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        raise HTTPException(status_code=500, detail=f"خطأ في معالجة الصوت: {str(e)}")

@router.get("/audio_output/{filename}")
async def get_audio_output(filename: str):
    """Serve synthesized audio files."""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    return FileResponse(file_path, media_type="audio/mpeg")
