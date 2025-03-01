from dotenv import load_dotenv
import os
import requests

def generate_documents(transcripts):
    api_url = "https://api.gemini.com/v1/generate"
    headers = {"Authorization": f"Bearer {os.environ['GEMINI_API_KEY']}"}
    
    payload = {
        "input": f"Generate minutes of meeting and medical notes for: {transcripts}",
        "model": "gemini-pro"
    }
    
    response = requests.post(api_url, json=payload, headers=headers)
    return response.json()