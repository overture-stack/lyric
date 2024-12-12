import { Router, json, urlencoded } from 'express';
import { BaseDependencies } from '../config/config.js';
import validationController from '../controllers/validationController.js';
import { auth } from '../middleware/auth.js';

const router = (dependencies: BaseDependencies): Router => {
    const router = Router();
    router.use(urlencoded({ extended: false }));
    router.use(json());

    router.get(
        '/validator/:categoryId/entity/:entityName',
        auth, 
        validationController(dependencies).validateRecord,
    );

    return router;
};

export default router;
