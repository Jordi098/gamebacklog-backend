import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import router from "./route/routes.js";

const app = express();
app.use(express.json());

try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
    app.use(express.urlencoded())
    app.use("/backlog", router);
} catch (e) {
    console.log("Database connection failed", e.message);

    app.use((req, res) => {
        res.status(500).send("Database connection failed");
    });
}

const PORT = process.env.EXPRESS_PORT;

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
