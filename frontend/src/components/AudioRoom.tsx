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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 pt-24 px-6 flex flex-col items-center justify-center">
      <div className="max-w-4xl mx-auto bg-slate-800/50 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-slate-700">
        <div className="mb-8 text-center">
          <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 mb-3">
            Audio Room
          </h2>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
            <p className="text-slate-300 font-medium">Room ID: {roomId}</p>
          </div>
        </div>
        
        {isRecording && (
          <div className="mb-8">
            <div className="flex flex-col items-center gap-6 mb-6">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping"/>
                <div className="absolute inset-2 bg-gradient-to-r from-red-500 to-red-600 rounded-full animate-pulse"/>
                <span className="relative text-white text-2xl font-mono font-bold">
                  {formatTime(recordingDuration)}
                </span>
              </div>
            </div>
            
            <div className="relative">
              <div className="w-full bg-slate-700/50 rounded-full h-3 mb-3">
                <div 
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 h-full rounded-full transition-all duration-100 shadow-lg shadow-cyan-500/20"
                  style={{ width: `${(audioLevel / 255) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 px-1">
                <span>0%</span>
                <span>Audio Level</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex flex-col items-center gap-4">
          <button

            onClick={isRecording ? stopRecording : startRecording}
            className={`px-8 py-4 rounded-full font-bold text-lg text-white transition-all transform hover:scale-105 active:scale-95 cursor-pointer
              ${isRecording 
                ? 'bg-gradient-to-r from-red-600 to-red-700 shadow-lg shadow-red-600/30' 
                : 'bg-gradient-to-r from-teal-500 to-cyan-500 shadow-lg shadow-cyan-500/30'
              }`}
          >
            {isRecording ? '⏹ Stop Recording' : '⏺ Start Recording'}
          </button>
          
          <p className="text-slate-400 text-sm">
            {isRecording 
              ? "Click 'Stop Recording' when you're finished"
              : "Click 'Start Recording' to begin"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AudioRoom;
