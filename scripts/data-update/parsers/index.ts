import type { Parsers } from '../run';
import { parseBigBoard, parseFullDraft } from './tankathon';

export const PARSERS: Parsers = {
  'tankathon-order': parseFullDraft,
  'tankathon-board': parseBigBoard,
};
