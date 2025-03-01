import assemblyai as aai
import os
from dotenv import load_dotenv

load_dotenv()
aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

# Define the local file path
audio_path = "D:/PROJECTS/sricity/server/uploads/null.wav"

transcriber = aai.Transcriber()
transcript = transcriber.transcribe(audio_path)

print("Transcription: ", transcript.text)
