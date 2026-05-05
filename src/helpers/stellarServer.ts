import { Server } from 'stellar-sdk';

const horizonUrl = (process.env.REACT_APP_HORIZON || '').trim();

export const createStellarServer = (): Server =>
  new Server(horizonUrl, {
    allowHttp: !horizonUrl.toLowerCase().startsWith('https://'),
  });
