import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import sessionsRouter from "./sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(sessionsRouter);

export default router;
