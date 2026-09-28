const mongoose = require("mongoose");

/**
 * Establishes a connection to MongoDB Atlas using the URI defined in .env
 * Exits the process on failure so misconfiguration is caught immediately.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes("your_mongodb_atlas_connection_string_here")) {
    console.error(
      "[REFORGE] MONGODB_URI is not set. Copy server/.env.example to server/.env and add your connection string."
    );
    process.exit(1);
  }

  try {
    mongoose.set("strictQuery", true);
    const conn = await mongoose.connect(uri, {});
    console.log(`[REFORGE] MongoDB connected -> host: ${conn.connection.host}`);

    mongoose.connection.on("error", (err) => {
      console.error("[REFORGE] MongoDB connection error:", err.message);
    });
    mongoose.connection.on("disconnected", () => {
      console.warn("[REFORGE] MongoDB disconnected.");
    });
  } catch (err) {
    console.error("[REFORGE] Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
