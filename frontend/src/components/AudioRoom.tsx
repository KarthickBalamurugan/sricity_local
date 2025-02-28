import { useState, useRef, useEffect } from 'react';

const AudioRoom = ({roomId}:{roomId:string}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Set up audio analysis
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      // Start audio level monitoring
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
          setAudioLevel(average);
        }
      };
      setInterval(updateAudioLevel, 100);

      // Start duration timer
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('roomId', roomId);

        try {
          const response = await fetch('http://127.0.0.1:5000/audio', {
            method: 'POST',
            body: formData
          });
          if (response.ok) {
            console.log('Audio uploaded successfully');
          } else {
            console.error('Failed to upload audio');
          }
        } catch (err) {
          console.error('Error uploading audio:', err);
        }
      };

      setIsRecording(false);
      setRecordingDuration(0);
      setAudioLevel(0);
    }
  };

  return (
    <div className="min-h-screen pt-24 px-6">
      <div className="max-w-2xl mx-auto bg-slate-800 rounded-lg p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Audio Room</h2>
          <p className="text-slate-300">Room ID: {roomId}</p>
        </div>
        
        {isRecording && (
          <div className="mb-6">
            <div className="flex justify-center items-center gap-4 mb-4">
              <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse"/>
              <span className="text-white text-xl font-mono">
                {formatTime(recordingDuration)}
              </span>
            </div>
            
            <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
              <div 
                className="bg-gradient-to-r from-teal-500 to-cyan-500 h-full rounded-full transition-all duration-100"
                style={{ width: `${(audioLevel / 255) * 100}%` }}
              />
            </div>
            <p className="text-slate-400 text-sm text-center">Audio Level</p>
          </div>
        )}
        
        <div className="flex justify-center">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-6 py-3 rounded-full font-medium text-white transition-all
              ${isRecording 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90'
              }`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioRoom;
