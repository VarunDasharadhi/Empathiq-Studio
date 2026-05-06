import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import sessionsRouter from "./sessions";
import humeRouter from "./hume";
import sarvamRouter from "./sarvam";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(sessionsRouter);
router.use(humeRouter);
router.use(sarvamRouter);

export default router;
