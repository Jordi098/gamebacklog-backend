import express from "express";
import mongoose from "mongoose";
import Game from "../models/games.js";
import {faker} from "@faker-js/faker";

const router = express.Router();

router.use((req, res, next) => {
    if (req.method === "OPTIONS") return next();

    const accept = req.headers.accept || "";
    if (accept.includes("application/json") || accept.includes("*/*") || accept === "") {
        return next();
    }

    return res.status(406).json({message: "Not acceptable, only application/json is supported"});
});

router.get("/", (req, res, next) => {
    const acceptHeader = req.headers.accept || "";
    console.log(`Client accepteert: ${acceptHeader}`);

    if (acceptHeader.includes("application/json") || acceptHeader.includes("*/*") || acceptHeader === "") {
        console.log("Dit is een JSON-response");
        return next();
    }

    return res.status(400).send("Illegal format");
});

// GET collection
router.get("/", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");

    try {
        const games = await Game.find();

        const items = games.map((game) => ({
            id: game.id,
            title: game.title ?? "",
            status: game.status ?? "backlog",
            hoursPlayed: game.hoursPlayed ?? 0,
            _links: {
                self: {href: `${process.env.BASE_URI}${game.id}`},
            },
        }));

        const gameCollection = {
            items,
            _links: {
                self: {href: `${process.env.BASE_URI}`},
                collection: {href: `${process.env.BASE_URI}`},
            },
        };

        return res.status(200).json(gameCollection);
    } catch (e) {
        return res.status(500).json({message: "Failed to fetch games"});
    }
});

// POST seed
router.post("/seed", async (req, res) => {
    try {
        const games = [];

        await Game.deleteMany({});

        const rawAmount = req.body?.amount ?? 10;
        const amount = Math.max(0, Math.min(500, Number(rawAmount) || 10));

        const statuses = ["backlog", "playing", "finished", "dropped"];

        for (let i = 0; i < amount; i++) {
            const gameData = new Game({
                title: faker.commerce.productName(),
                status: faker.helpers.arrayElement(statuses),
                hoursPlayed: faker.number.int({min: 0, max: 250}),
                rating: faker.datatype.boolean()
                    ? faker.number.int({min: 1, max: 10})
                    : null,
            });

            const saved = await gameData.save();
            games.push(saved);
        }

        res.status(201).json({amount, games});
    } catch (e) {
        res.status(500).json({message: e.message || "Failed to seed games"});
    }
});

// POST create
router.post("/", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");

    try {
        const {title, status, hoursPlayed, rating} = req.body ?? {};

        if (!title || !status) {
            return res.status(400).json({message: "title and status is required"});
        }

        const created = await Game.create({title, status, hoursPlayed, rating});

        return res.status(201).json(created);
    } catch (e) {
        return res.status(500).json({message: e.message || "Failed to create game"});
    }
});

// GET single
router.get("/:id", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    try {
        const gameId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(gameId)) {
            return res.status(400).json({message: "Invalid game id"});
        }

        const game = await Game.findById(gameId);

        if (!game) {
            return res.status(404).json({message: "Game not found"});
        }
        const lastModifiedDate = game.updatedAt instanceof Date ? game.updatedAt : new Date(game._id.getTimestamp());

        res.set("Last-Modified", lastModifiedDate);

        const ifModifiedSince = req.headers["if-modified-since"];
        if (ifModifiedSince) {
            const sinceDate = new Date(ifModifiedSince);

            if ((sinceDate.getTime()) && lastModifiedDate <= sinceDate) {
                return res.status(304).end();
            }
        }

        res.status(200).json(game);
    } catch (e) {
        res.status(500).json({message: "Failed to fetch game"});
    }
});

// OPTIONS
router.options("/", (req, res) => {
    res.set("Allow", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Accept");
    return res.sendStatus(204);
});

router.options("/:id", (req, res) => {
    res.set("Allow", "GET, PUT, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Accept");
    return res.sendStatus(204);
});

// PUT update
router.put("/:id", async (req, res) => {
    try {
        const gameId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(gameId)) {
            return res.status(400).json({message: "Invalid game id"});
        }

        const {title, status, hoursPlayed, rating} = req.body ?? {};

        if (title === undefined && status === undefined && hoursPlayed === undefined && rating === undefined) {
            return res.status(400).json({
                message: "Provide at least one field to update: title, status, hoursPlayed, rating",
            });
        }

        const updated = await Game.findByIdAndUpdate(
            gameId,
            {
                ...(title !== undefined && {title}),
                ...(status !== undefined && {status}),
                ...(hoursPlayed !== undefined && {hoursPlayed}),
                ...(rating !== undefined && {rating}),
            },
            {new: true, runValidators: true}
        );

        if (!updated) {
            return res.status(404).json({message: "Game not found"});
        }

        res.status(200).json(updated);
    } catch (e) {
        if (e?.name === "ValidationError") {
            return res.status(400).json({message: e.message});
        }
        res.status(500).json({message: "Failed to update game"});
    }
});
// PATCH update

router.patch("/:id", async (req, res) => {
    try {
        const gameId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(gameId)) {
            return res.status(400).json({message: "Invalid game id"});
        }

        const {title, status, hoursPlayed, rating} = req.body ?? {};

        if (title === undefined && status === undefined && hoursPlayed === undefined && rating === undefined) {
            return res.status(400).json({
                message: "Provide at least one field to update: title, status, hoursPlayed, rating",
            });
        }

        const updated = await Game.findByIdAndUpdate(
            gameId,
            {
                ...(title !== undefined && {title}),
                ...(status !== undefined && {status}),
                ...(hoursPlayed !== undefined && {hoursPlayed}),
                ...(rating !== undefined && {rating}),
            },
            {new: true, runValidators: true}
        );

        if (!updated) {
            return res.status(404).json({message: "Game not found"});
        }

        res.status(200).json(updated);
    } catch (e) {
        if (e?.name === "ValidationError") {
            return res.status(400).json({message: e.message});
        }
        res.status(500).json({message: "Failed to update game"});
    }
});

// DELETE remove
router.delete("/:id", async (req, res) => {
    try {
        const gameId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(gameId)) {
            return res.status(400).json({message: "Invalid game id"});
        }

        const deleted = await Game.findByIdAndDelete(gameId);

        if (!deleted) {
            return res.status(404).json({message: "Game not found"});
        }

        res.status(204).send();
    } catch (e) {
        res.status(500).json({message: "Failed to delete game"});
    }
});

export default router;
