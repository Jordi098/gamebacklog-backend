import express from "express";
import mongoose from "mongoose";
import Game from "../models/games.js";
import {faker} from "@faker-js/faker";

const router = express.Router();

router.use((req, res, next) => {
    if (req.method === "OPTIONS") return next();

    const accept = req.headers.accept || "";
    if (accept.includes("application/json") || accept.includes("*/*")) {
        return next();
    }

    return res
        .status(406)
        .json({message: "Not acceptable, only application/json is supported"});
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
    res.set("Allow", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Accept");
    return res.sendStatus(204);
});

// GET collection
router.get("/", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");

    try {
        const page = parseInt(req.query.page, 10) || 1;

        const limitParam = req.query.limit;
        const hasLimit = limitParam !== undefined && limitParam !== null && limitParam !== "";

        const status = (req.query.status || "").trim();
        let filter = {};
        // apply status filter if provided
        if (status) {
            filter = {status};
        }
        // count total items matching filter
        const totalItems = await Game.countDocuments(filter);
        let limit;
        let totalPages;
        let safePage;
        let skip;

        if (hasLimit) {
            // enforce limit boundaries
            limit = Math.max(1, parseInt(limitParam, 10) || 5);
            // calculate total pages
            totalPages = Math.max(1, Math.ceil(totalItems / limit));
            // enforce page boundaries
            safePage = Math.min(Math.max(1, page), totalPages);
            // calculate skip
            skip = (safePage - 1) * limit;
        } else {
            limit = totalItems;
            totalPages = 1;

            safePage = 1;
            skip = 0;
        }

        const games = await Game.find(filter).skip(skip).limit(limit);

        const base = process.env.BASE_URI;

        const makeHref = (p) => {
            let url = base;
            if (!hasLimit) {
                if (status) {
                    url = `${base}?status=${status}`;
                } else {
                    url = base;
                }
                return url;
            }
            url = `${base}?page=${p}&limit=${limit}`;
            if (status) {
                url += `&status=${status}`;
            }
            return url;
        };

        const items = games.map((game) => ({
            id: game.id,
            title: game.title ?? "",
            status: game.status ?? "backlog",
            hoursPlayed: game.hoursPlayed ?? 0,
            _links: {self: {href: `${base}${game.id}`}},
        }));

        return res.status(200).json({
            items,
            _links: {
                self: {href: makeHref(safePage)},
                collection: {href: base},
            },
            pagination: {
                currentPage: hasLimit ? safePage : 1,
                currentItems: items.length,
                totalPages,
                totalItems,
                _links: hasLimit
                    ? {
                        first: {page: 1, href: makeHref(1)},
                        last: {page: totalPages, href: makeHref(totalPages)},
                        previous: safePage > 1 ? {page: safePage - 1, href: makeHref(safePage - 1)} : null,
                        next: safePage < totalPages ? {page: safePage + 1, href: makeHref(safePage + 1)} : null,
                    }
                    : {
                        first: {page: 1, href: makeHref(1)},
                        last: {page: 1, href: makeHref(1)},
                        previous: null,
                        next: null,
                    },
            },
        });
    } catch (e) {
        return res.status(500).json({message: e.message});
    }
});

// POST (overload SEED + normal create)
router.post("/", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");

    try {
        const overload = (req.body?.METHOD || "").toUpperCase();

        // POST OVERLOAD: SEED
        if (overload === "SEED") {
            const games = [];

            await Game.deleteMany({});

            const rawAmount = req.body?.amount ?? 20;
            const amount = Math.max(0, Math.min(500, Number(rawAmount) || 10));

            const statuses = ["backlog", "playing", "finished", "dropped"];

            for (let i = 0; i < amount; i++) {
                const gameData = new Game({
                    title: faker.commerce.productName(),
                    status: faker.helpers.arrayElement(statuses),
                    description: faker.lorem.sentence(),
                    hoursPlayed: faker.number.int({min: 0, max: 250}),
                    rating: faker.datatype.boolean()
                        ? faker.number.int({min: 1, max: 10})
                        : null,
                });

                const saved = await gameData.save();
                games.push(saved);
            }

            return res.status(201).json({METHOD: "SEED", amount, games});
        }

        // normal POST: create game
        const {title, status, description, hoursPlayed, rating} = req.body ?? {};

        if (!title || !status) {
            return res.status(400).json({message: "title and status is required"});
        }

        const created = await Game.create({title, status, description, hoursPlayed, rating});
        return res.status(201).json(created);
    } catch (e) {
        return res.status(500).json({message: e.message || "Failed to process request"});
    }
});

// GET single
router.get("/:id", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    try {
        const gameId = req.params.id;

        const game = await Game.findById(gameId);

        if (!game) {
            return res.status(404).json({message: "Game not found"});
        }

        let lastModifiedDate;
        if (game.updatedAt instanceof Date) {
            lastModifiedDate = game.updatedAt;
        } else {
            lastModifiedDate = new Date(game._id.getTimestamp());
        }


        res.set("Last-Modified", lastModifiedDate);

        const ifModifiedSince = req.headers["if-modified-since"];
        if (ifModifiedSince) {
            const sinceDate = new Date(ifModifiedSince);
            if (sinceDate.getTime() && lastModifiedDate <= sinceDate) {
                return res.status(304).end();
            }
        }

        return res.status(200).json(game);
    } catch (e) {
        return res.status(500).json({message: "Failed to fetch game"});
    }
});

// PUT update
router.put("/:id", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    try {
        const gameId = req.params.id;

        const {title, status, description, hoursPlayed, rating} = req.body ?? {};

        if (
            title === undefined &&
            status === undefined &&
            description === undefined &&
            hoursPlayed === undefined &&
            rating === undefined
        ) {
            return res.status(400).json({
                message: "Provide at least one field to update: title, status, description, hoursPlayed, rating",
            });
        }

        const updated = await Game.findByIdAndUpdate(
            gameId,
            {
                ...(title !== undefined && {title}),
                ...(status !== undefined && {status}),
                ...(description !== undefined && {description}),
                ...(hoursPlayed !== undefined && {hoursPlayed}),
                ...(rating !== undefined && {rating}),
            },
            {new: true, runValidators: true}
        );

        if (!updated) {
            return res.status(404).json({message: "Game not found"});
        }

        return res.status(200).json(updated);
    } catch (e) {
        if (e?.name === "ValidationError") {
            return res.status(400).json({message: e.message});
        }
        return res.status(500).json({message: "Failed to update game"});
    }
});

// PATCH update
router.patch("/:id", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    try {
        const gameId = req.params.id;

        const {title, status, description, hoursPlayed, rating} = req.body ?? {};

        if (
            title === undefined &&
            status === undefined &&
            description === undefined &&
            hoursPlayed === undefined &&
            rating === undefined
        ) {
            return res.status(400).json({
                message: "Provide at least one field to update: title, status, description, hoursPlayed, rating",
            });
        }

        const updated = await Game.findByIdAndUpdate(
            gameId,
            {
                ...(title !== undefined && {title}),
                ...(status !== undefined && {status}),
                ...(description !== undefined && {description}),
                ...(hoursPlayed !== undefined && {hoursPlayed}),
                ...(rating !== undefined && {rating}),
            },
            {new: true, runValidators: true}
        );

        if (!updated) {
            return res.status(404).json({message: "Game not found"});
        }

        return res.status(200).json(updated);
    } catch (e) {
        if (e?.name === "ValidationError") {
            return res.status(400).json({message: e.message});
        }
        return res.status(500).json({message: "Failed to update game"});
    }
});

// DELETE remove
router.delete("/:id", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    try {
        const gameId = req.params.id;

        const deleted = await Game.findByIdAndDelete(gameId);

        if (!deleted) {
            return res.status(404).json({message: "Game not found"});
        }

        return res.status(204).send();
    } catch (e) {
        return res.status(500).json({message: "Failed to delete game"});
    }
});

export default router;
