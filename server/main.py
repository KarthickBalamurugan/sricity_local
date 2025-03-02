from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import qrcode
import base64
from io import BytesIO
import uuid
from bson import ObjectId
from werkzeug.utils import secure_filename
import time
import requests
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
import tempfile
import torch
from transformers import BertTokenizer, BertForSequenceClassification

# ===== Firebase Admin SDK =====
import firebase_admin
from firebase_admin import credentials, storage

# Load environment variables
load_dotenv()
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
WHISPER_API_URL = "https://api.whisper.ai/transcribe"

# Load Clinical BERT model and tokenizer
CLINICAL_BERT_MODEL_NAME = "emilyalsentzer/Bio_ClinicalBERT"
tokenizer = BertTokenizer.from_pretrained(CLINICAL_BERT_MODEL_NAME)
model = BertForSequenceClassification.from_pretrained(CLINICAL_BERT_MODEL_NAME)
if not ASSEMBLYAI_API_KEY:
    raise ValueError("AssemblyAI API key not found in environment variables")
if not GEMINI_API_KEY:
    raise ValueError("Gemini API key not found in environment variables")

ASSEMBLYAI_UPLOAD_URL = "https://api.assemblyai.com/v2/upload"
ASSEMBLYAI_TRANSCRIBE_URL = "https://api.assemblyai.com/v2/transcript"

# MongoDB setup
mongodb_uri = os.getenv('MONGODB_URI')
if not mongodb_uri:
    raise ValueError("MongoDB URI not found in environment variables")

client = MongoClient(mongodb_uri)
db = client.MediScript
users_collection = db.Users
rooms_collection = db.Rooms

# ===== Initialize Firebase =====
# Make sure you have your service account JSON file in the same directory or provide an absolute path.
cred = credentials.Certificate("firebase-config.json")
firebase_admin.initialize_app(cred, {
    "storageBucket": "kishorekumar-84b5f.appspot.com"  # Replace with your bucket name
})
bucket = storage.bucket()

# Flask app setup
app = Flask(__name__)
CORS(app)

def transcribe_audio_bytes(audio_bytes):
    """Transcribe audio bytes using AssemblyAI with speaker diarization enabled."""
    headers = {"authorization": ASSEMBLYAI_API_KEY}

    # 1. Upload the audio bytes
    upload_response = requests.post(
        ASSEMBLYAI_UPLOAD_URL,
        headers=headers,
        data=audio_bytes
    )

    if upload_response.status_code != 200:
        return {"error": f"Upload failed: {upload_response.json()}"}

    upload_url = upload_response.json().get("upload_url")

    # 2. Request transcription with speaker diarization
    transcript_request = requests.post(
        ASSEMBLYAI_TRANSCRIBE_URL,
        json={"audio_url": upload_url, "speaker_labels": True},
        headers=headers
    )

    if transcript_request.status_code != 200:
        return {"error": f"Transcription request failed: {transcript_request.json()}"}

    transcript_id = transcript_request.json().get("id")

    # 3. Poll for the result
    while True:
        result_response = requests.get(f"{ASSEMBLYAI_TRANSCRIBE_URL}/{transcript_id}", headers=headers)
        result = result_response.json()

        if result_response.status_code != 200:
            return {"error": f"Error fetching transcription: {result}"}

        if result.get("status") == "completed":
            return {
                "text": result.get("text", ""),
                "speakers": result.get("utterances", []),
                "status": "completed"
            }

        elif result.get("status") == "error":
            return {"error": "Transcription failed", "status": "error"}

        time.sleep(5)  # Wait before polling again

def check_user_status(email):
    """Check if the user exists; if not, create it."""
    user = users_collection.find_one({"email": email})
    if not user:
        new_user = {
            "email": email,
            "isAdmin": False,
            "isApproved": False
        }
        users_collection.insert_one(new_user)
        return False, False, False
    return True, user.get('isAdmin', False), user.get('isApproved', False)

@app.route('/session', methods=['POST'])
def index():
    """User login session management."""
    data = request.get_json()
    if data and 'user' in data:
        email = data['user']['emailAddresses'][0]['emailAddress']
        user_exists, is_admin, is_approved = check_user_status(email)
        return jsonify({
            'message': 'Login successful' if is_approved else 'User on waitlist',
            'Login': is_approved,
            'isAdmin': is_admin
        })
    return jsonify({'message': 'Login failed', 'Login': False, 'isAdmin': False})

@app.route('/users', methods=['GET'])
def get_users():
    """Get all users (Admin panel access)."""
    users = list(users_collection.find())
    for user in users:
        user['_id'] = str(user['_id'])
    return jsonify(users)

@app.route('/create-room', methods=['POST'])
def create_room():
    """Create a new room with a QR code."""
    data = request.get_json()
    email = data.get('session')
    room_name = data.get('roomName')

    if not email or not room_name:
        return jsonify({'error': 'Missing required fields'}), 400

    room_id = str(uuid.uuid4())

    # Generate QR code
    qr = qrcode.make(room_id)
    buffer = BytesIO()
    qr.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    # Store room data
    room_data = {
        "roomID": room_id,
        "roomName": room_name,
        "email": email,
        "participants": [email],
        "qrCode": qr_base64,
        "audio": []
    }
    rooms_collection.insert_one(room_data)

    return jsonify({'message': 'Room created successfully', 'roomID': room_id, 'qrCode': qr_base64})

@app.route('/users/<email>', methods=['PUT'])
def update_user(email):
    """Update user permissions (Admin)."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    update_data = {}
    if 'isApproved' in data:
        update_data['isApproved'] = data['isApproved']
    if 'isAdmin' in data:
        update_data['isAdmin'] = data['isAdmin']
        
    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400
    
    result = users_collection.update_one(
        {"email": email},
        {"$set": update_data}
    )
    
    if result.modified_count:
        return jsonify({'message': 'User updated successfully'})
    return jsonify({'error': 'User not found'}), 404

@app.route('/join-room', methods=['POST'])
def join_room():
    """Add a user to a room."""
    data = request.get_json()
    
    room = rooms_collection.find_one({"roomID": data["roomId"]})
    if not room:
        return jsonify({"error": "Room not found", "state": "0"}), 404

    if data["session"] not in room.get("participants", []):
        rooms_collection.update_one(
            {"roomID": data["roomId"]},
            {"$push": {"participants": data["session"]}}
        )
        return jsonify({"message": "Added to room", "state": "1"})
    
    return jsonify({"message": "Already in room", "state": "2"})

def generate_report(transcript_text):
    """Generate meeting minutes and medical notes using Gemini."""
    api_url = "https://api.gemini.com/v1/generate"
    headers = {"Authorization": f"Bearer {GEMINI_API_KEY}"}
    
    prompt = f"""Based on the following medical conversation transcript, generate:
    1. Meeting Minutes including:
       - Date and time
       - Key discussion points
       - Action items
       - Decisions made
    
    2. Medical Notes including:
       - Patient symptoms/conditions discussed
       - Diagnoses mentioned
       - Treatment recommendations
       - Follow-up actions
    
    Transcript:
    {transcript_text}
    
    Please format the response in clear sections with headers and bullet points."""
    
    payload = {
        "input": prompt,
        "model": "gemini-2.0-flash"
    }
    
    response = requests.post(api_url, json=payload, headers=headers)
    return response.json().get('output', 'Error generating report')

def create_pdf_report(meeting_minutes, room_name):
    """Create a PDF report with the generated content."""
    # Create a temporary file
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
        pdf_path = tmp_file.name
        
    # Create the PDF document
    doc = SimpleDocTemplate(pdf_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []

    # Add title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=30
    )
    story.append(Paragraph(f"Meeting Report - {room_name}", title_style))
    story.append(Spacer(1, 20))

    # Add content
    content_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=12
    )
    
    # Split content into paragraphs and add them to the story
    paragraphs = meeting_minutes.split('\n')
    for para in paragraphs:
        if para.strip():
            if para.startswith('#') or para.startswith('*'):
                # Format headers and bullet points
                story.append(Paragraph(para.replace('#', '').strip(), styles['Heading2']))
            else:
                story.append(Paragraph(para, content_style))
            story.append(Spacer(1, 12))

    # Build the PDF
    doc.build(story)
    return pdf_path

@app.route('/audio', methods=['POST'])
def upload_audio():
    """Upload audio file to Firebase Storage, transcribe it, generate report, and store data in MongoDB."""
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file uploaded"}), 400

    audio_file = request.files['audio']
    room_id = request.form.get('roomId', 'unknown_room')
    
    # Get room name for the report
    room = rooms_collection.find_one({"roomID": room_id})
    if not room:
        return jsonify({"error": "Room not found"}), 404
    
    room_name = room.get('roomName', 'Unknown Room')
    
    # Create a secure filename (e.g. "some-room-id.wav")
    filename = secure_filename(f"{room_id}.wav")

    # Read file content into memory
    audio_bytes = audio_file.read()

    # Create a reference to "MedSxript/<filename>" in Firebase
    blob = bucket.blob(f"MedSxript/{filename}")
    
    # Upload to Firebase
    blob.upload_from_string(audio_bytes, content_type="audio/wav")
    blob.make_public()
    public_url = blob.public_url

    # Get transcription from AssemblyAI
    transcription_result = transcribe_audio_bytes(audio_bytes)
    
    if "error" in transcription_result:
        return jsonify({
            "error": "Transcription failed",
            "details": transcription_result["error"]
        }), 500

    # Generate report using Gemini
    report_content = generate_report(transcription_result["text"])
    
    # Create PDF report
    pdf_path = create_pdf_report(report_content, room_name)
    
    # Upload PDF to Firebase
    pdf_filename = secure_filename(f"{room_id}_{int(time.time())}_report.pdf")
    pdf_blob = bucket.blob(f"MedSxript/reports/{pdf_filename}")
    
    with open(pdf_path, 'rb') as pdf_file:
        pdf_blob.upload_from_file(pdf_file, content_type='application/pdf')
    
    pdf_blob.make_public()
    pdf_url = pdf_blob.public_url
    
    # Clean up temporary PDF file
    os.unlink(pdf_path)

    # Update MongoDB with audio URL, transcription, and PDF URL
    update_data = {
        "$push": {
            "audio": public_url,
            "transcripts": {
                "audio_url": public_url,
                "full_text": transcription_result["text"],
                "speakers": transcription_result["speakers"],
                "timestamp": time.time(),
                "report_url": pdf_url
            }
        }
    }

    rooms_collection.update_one(
        {"roomID": room_id},
        update_data
    )
    
    return jsonify({
        "message": "Audio uploaded, transcribed, and report generated successfully",
        "url": public_url,
        "report_url": pdf_url,
        "transcript": transcription_result
    }), 200

@app.route('/rooms', methods=['GET'])
def get_rooms():
    """Get all rooms (Admin panel access)."""
    rooms = list(rooms_collection.find())
    for room in rooms:
        room['_id'] = str(room['_id'])
    return jsonify(rooms)
@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if 'file' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['file']


    response = requests.post(WHISPER_API_URL, files={'file': audio_file})

    if response.status_code != 200:
        return jsonify({"error": "Failed to transcribe audio"}), 500

    transcript = response.json().get('transcript', '')

    return jsonify({"transcript": transcript})
@app.route('/analyze', methods=['POST'])
def analyze_transcript():
    data = request.json

    if 'transcript' not in data:
        return jsonify({"error": "No transcript provided"}), 400

    transcript = data['transcript']

    inputs = tokenizer(transcript, return_tensors="pt", truncation=True, padding=True)

    with torch.no_grad():
        outputs = model(**inputs)

    predicted_class = torch.argmax(logits, dim=1).item()

    return jsonify({"predicted_class": predicted_class})

if __name__ == '__main__':
    app.run(debug=True)
