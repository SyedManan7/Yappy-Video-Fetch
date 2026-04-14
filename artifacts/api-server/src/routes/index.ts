import { Router, type IRouter } from "express";
import healthRouter from "./health";
import downloaderRouter from "./downloader";

const router: IRouter = Router();

router.use(healthRouter);
router.use(downloaderRouter);

export default router;
