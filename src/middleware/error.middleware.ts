import { Request, Response, NextFunction } from "express";
import { logger } from "@/utils/logger";

export class ErrorMiddleware {
    static handle(error: any, req: Request, res: Response, next: NextFunction): void {
        logger.error("An error occurred:", error);

        if (error.isJoi) {
            res.status(400).json({
                success: false,
                error: "Validation error",
                details: error.details
            })
            return;
        }

        res.status(500).json({
            success: false,
            error: "Internal server error",
        })
    }
}