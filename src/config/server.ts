import express, { Application} from "express";
import cors from "cors";
import { logger } from "@/utils/logger";

export class ServerConfig {
    public app: Application;
    private port: number;

    constructor() {
        this.app = express();
        this.port = parseInt(process.env.PORT || "3000", 10);
        this.initializeMiddleware();
    }

    private initializeMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json({ limit: "50mb" }));
        this.app.use(express.urlencoded({ extended: true, limit: "50mb" }));
    }

    public listen(): void {
        this.app.listen(this.port, () => {
            logger.info(`Server is running on port ${this.port}`);
        })
    }

    public getPort(): number {
        return this.port;
    }
}