import mongoose from "mongoose";
import "dotenv/config";

const gameSchema = new mongoose.Schema(
    {
        title: {type: String, required: true},
        status: {
            type: String,
            required: true,
            enum: ["backlog", "playing", "finished", "dropped"],
            default: "backlog",
        },
        hoursPlayed: {type: Number, required: true, default: 0},
        rating: {type: Number, required: false},
    },
    {
        toJSON: {
            virtuals: true,
            versionKey: false,
            transform: (doc, ret) => {
                ret._links = {
                    self: {href: `${process.env.BASE_URI}${ret._id}`},
                    collection: {href: `${process.env.BASE_URI}`},
                };
                delete ret._id;
            },
        },
    }
);

const Game = mongoose.model("Game", gameSchema);
export default Game;
