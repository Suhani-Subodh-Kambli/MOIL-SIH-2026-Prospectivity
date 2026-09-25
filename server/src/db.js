import mongoose from "mongoose";

let isConnected = false;

export async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/moil_sih";
  
  try {
    mongoose.set("strictQuery", false);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${conn.connection.name} (${conn.connection.host}:${conn.connection.port})`);
    return true;
  } catch (error) {
    isConnected = false;
    console.warn(`[MongoDB] Connection failed: ${error.message}. Running in fallback mode.`);
    return false;
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

export function getDbInfo() {
  const state = mongoose.connection.readyState;
  const states = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  return {
    connected: state === 1,
    state: states[state] || "unknown",
    name: mongoose.connection.name || "moil_sih",
    host: mongoose.connection.host || "localhost",
    port: mongoose.connection.port || 27017
  };
}
