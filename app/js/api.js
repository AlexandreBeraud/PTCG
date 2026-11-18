import { config } from '../config.js';
import { creerApi } from '/_shared/api.js';

// Client du kit commun, sur le schéma v2 ; l'ancienne appli reste sur public
export { ApiError } from '/_shared/api.js';
export const { api } = creerApi({ base: config.api });
