import { useState } from "react";
import { useNavigate } from "react-router-dom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Room = ({ session,roomId,setRoomId }: { session: any,roomId:any,setRoomId:any }) => {
  const [option, setOption] = useState("create");
  const [roomName, setRoomName] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [joinId,setJoinId] = useState<string | null>(null);
  const navigate = useNavigate(); 

  const handleSubmit = () => {
    fetch("http://localhost:5000/create-room", {
      // fetch("https://sricity-backend.vercel.app/create-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomName: roomName,
        session: session.user.emailAddresses[0].emailAddress,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.qrCode) {
          setQrCode(data.qrCode); // Store the QR code
          setRoomId(data.roomID); // Store the Room ID
        }
      });
  };

  const handleJoin =()=>{
    fetch("http://localhost:5000/join-room",{
      method:"POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomId: joinId,
        session: session.user.emailAddresses[0].emailAddress,
      }),
    })
    .then((res) => res.json())
    .then((data)=>{
      if(data.state === "0") {
        alert("Room not found. Please enter a valid room ID.");
      } else if(data.state === "1") {
        setRoomId(joinId);
        navigate('/room');
      } else if(data.state === "2") {
        setRoomId(joinId);
        navigate('/room');
      }
    })
  }

  const redirect = () => {
    if (!roomId) {
      alert("Please create a room first!");
      return;
    }
    navigate('/room');
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-6">Create or Join a Room</h2>

        <div className="flex justify-center space-x-4 mb-6">
          <button
            className={`px-4 py-2 rounded-lg border ${option === "create" ? "bg-gray-300" : ""}`}
            onClick={() => setOption("create")}
          >
            Create Room
          </button>
          <button
            className={`px-4 py-2 rounded-lg border ${option === "join" ? "bg-gray-300" : ""}`}
            onClick={() => setOption("join")}
          >
            Join Room
          </button>
        </div>

        {option === "create" ? (
          <>
          <div className="p-4 rounded-xl shadow-md">
            <h3 className="text-lg font-semibold">Create a Room</h3>
            <input
              type="text"
              placeholder="Enter Room Name"
              className="w-full mt-2 p-2 border rounded-lg focus:outline-none focus:ring-2"
              onChange={(e) => setRoomName(e.target.value)}
            />
            <button className="w-full mt-3 py-2 rounded-lg border" onClick={handleSubmit}>
              Create
            </button>

            {/* Display QR Code and Room ID if available */}
            {qrCode && (
              <div className="mt-4 flex flex-col items-center">
                <p className="text-center font-semibold">Room ID: {roomId}</p>
                <p className="text-center">Scan to Join:</p>
                <img
                  src={`data:image/png;base64,${qrCode}`}
                  alt="QR Code"
                  className="mt-2 w-40 h-40 border rounded-lg"
                />
              </div>
            )}
          </div>
          <div className="flex justify-center mt-4 -mb-4">
            <button className="bg-red-400 px-2 py-1 rounded-md font-light text-lg" onClick={redirect}>Start the meeting</button>
          </div>
          </>
        ) : (
          <div className="p-4 rounded-xl shadow-md">
            <h3 className="text-lg font-semibold">Join a Room</h3>
            <input
              type="text"
              placeholder="Enter Room Id"
              className="w-full mt-2 p-2 border rounded-lg focus:outline-none focus:ring-2"
              onChange={(e) => setJoinId(e.target.value)}
            />
            <button className="w-full mt-3 py-2 rounded-lg border" onClick={handleJoin}>Join</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Room;
