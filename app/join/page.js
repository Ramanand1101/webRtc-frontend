"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinPage() {
  const [identity, setIdentity] = useState("");
  const [roomName, setRoomName] = useState("");
  const [isPublisher, setIsPublisher] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleJoin = async () => {
    if (!identity || !roomName) {
      alert("Please enter your name and room name.");
      return;
    }
    
    setIsLoading(true);
    // Simulate loading for better UX
    setTimeout(() => {
      const role = isPublisher ? "publisher" : "audience";
      router.push(`/room?name=${encodeURIComponent(identity)}&room=${encodeURIComponent(roomName)}&role=${role}`);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20"></div>
      
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-l from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8 space-y-6 transform transition-all duration-500 hover:scale-105">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full mb-4 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white">Join LiveKit Room</h1>
            <p className="text-white/70">Enter your details to start streaming</p>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Name Input */}
            <div className="group">
              <label className="block text-sm font-medium text-white/80 mb-2">Your Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-white/40 group-focus-within:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                />
              </div>
            </div>

            {/* Room Name Input */}
            <div className="group">
              <label className="block text-sm font-medium text-white/80 mb-2">Room Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-white/40 group-focus-within:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Enter room name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                />
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/80">Join as</label>
              <div className="flex space-x-4">
                <label className={`flex-1 relative cursor-pointer group ${isPublisher ? 'text-white' : 'text-white/60'}`}>
                  <input
                    type="radio"
                    name="role"
                    checked={isPublisher}
                    onChange={() => setIsPublisher(true)}
                    className="sr-only"
                  />
                  <div className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                    isPublisher 
                      ? 'border-purple-400 bg-purple-500/20 shadow-lg' 
                      : 'border-white/20 bg-white/5 hover:border-white/40'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isPublisher ? 'border-purple-400' : 'border-white/40'
                      }`}>
                        {isPublisher && <div className="w-2 h-2 bg-purple-400 rounded-full"></div>}
                      </div>
                      <div>
                        <div className="font-medium">Publisher</div>
                        <div className="text-xs text-white/60">Share audio & video</div>
                      </div>
                    </div>
                  </div>
                </label>

                <label className={`flex-1 relative cursor-pointer group ${!isPublisher ? 'text-white' : 'text-white/60'}`}>
                  <input
                    type="radio"
                    name="role"
                    checked={!isPublisher}
                    onChange={() => setIsPublisher(false)}
                    className="sr-only"
                  />
                  <div className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                    !isPublisher 
                      ? 'border-purple-400 bg-purple-500/20 shadow-lg' 
                      : 'border-white/20 bg-white/5 hover:border-white/40'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        !isPublisher ? 'border-purple-400' : 'border-white/40'
                      }`}>
                        {!isPublisher && <div className="w-2 h-2 bg-purple-400 rounded-full"></div>}
                      </div>
                      <div>
                        <div className="font-medium">Audience</div>
                        <div className="text-xs text-white/60">Watch only</div>
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Join Button */}
          <button
            onClick={handleJoin}
            disabled={isLoading || !identity || !roomName}
            className="w-full py-4 px-6 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent"
          >
            {isLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Joining...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <span>Join Room</span>
              </div>
            )}
          </button>

          {/* Footer */}
          <div className="text-center">
            <p className="text-white/50 text-sm">
              Powered by LiveKit
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}