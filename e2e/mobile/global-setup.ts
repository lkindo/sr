import { assertLocalMobileDatabase } from './cleanup';

export default function globalSetup() {
  assertLocalMobileDatabase();
}
