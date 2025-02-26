import {GameIdLedger, IDatabase} from './IDatabase';
import {Game, Score} from '../Game';
import {GameOptions} from '../GameOptions';
import {GameId, isGameId, PlayerId, SpectatorId} from '../../common/Types';
import {SerializedGame} from '../SerializedGame';
import {copyFileSync, Dirent, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync} from 'fs';

const path = require('path');
const defaultDbFolder = path.resolve(process.cwd(), './db/files');

export class LocalFilesystem implements IDatabase {
  protected readonly dbFolder: string;
  private readonly historyFolder: string;
  constructor(dbFolder: string = defaultDbFolder) {
    this.dbFolder = dbFolder;
    this.historyFolder = path.resolve(dbFolder, 'history');
  }

  public initialize(): Promise<void> {
    console.log(`Starting local database at ${this.dbFolder}`);
    if (!existsSync(this.dbFolder)) {
      mkdirSync(this.dbFolder);
    }
    if (!existsSync(this.historyFolder)) {
      mkdirSync(this.historyFolder);
    }
    return Promise.resolve();
  }

  private filename(gameId: string): string {
    return path.resolve(this.dbFolder, `${gameId}.json`);
  }

  private historyFilename(gameId: string, saveId: number) {
    const saveIdString = saveId.toString().padStart(5, '0');
    return path.resolve(this.historyFolder, `${gameId}-${saveIdString}.json`);
  }

  saveGame(game: Game): Promise<void> {
    console.log(`saving ${game.id} at position ${game.lastSaveId}`);
    this.saveSerializedGame(game.serialize());
    game.lastSaveId++;
    return Promise.resolve();
  }

  saveSerializedGame(serializedGame: SerializedGame): void {
    const text = JSON.stringify(serializedGame, null, 2);
    writeFileSync(this.filename(serializedGame.id), text);
    writeFileSync(this.historyFilename(serializedGame.id, serializedGame.lastSaveId), text);
  }

  getGame(game_id: GameId): Promise<SerializedGame> {
    try {
      console.log(`Loading ${game_id}`);
      const text = readFileSync(this.filename(game_id));
      const serializedGame = JSON.parse(text.toString());
      return Promise.resolve(serializedGame);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      throw error;
    }
  }

  async getGameId(id: PlayerId | SpectatorId): Promise<GameId> {
    const participants = await this.getParticipants();
    for (const entry of participants) {
      if (entry.participantIds.includes(id)) {
        return entry.gameId;
      }
    }
    throw new Error(`participant id ${id} not found`);
  }

  getSaveIds(gameId: GameId): Promise<Array<number>> {
    const results: Array<number> = [];
    const entries = readdirSync(this.historyFolder, {withFileTypes: true});
    for (const dirent of entries) {
      if (dirent.name.startsWith(gameId + '-') && dirent.isFile()) {
        const match = dirent.name.match(/(.*)-(.*).json/);
        if (match !== null) {
          const saveIdAsString = match[2];
          results.push(Number(saveIdAsString));
        }
      }
    }
    return Promise.resolve(results);
  }

  getGameVersion(gameId: GameId, saveId: number): Promise<SerializedGame> {
    try {
      console.log(`Loading ${gameId} at ${saveId}`);
      const text = readFileSync(this.historyFilename(gameId, saveId));
      const serializedGame = JSON.parse(text.toString());
      return Promise.resolve(serializedGame);
    } catch (e) {
      console.log(e);
      return Promise.reject(new Error(`Game ${gameId} not found at save_id ${saveId}`));
    }
  }

  async getPlayerCount(gameId: GameId): Promise<number> {
    const gameIds = await this.getGameIds();
    const found = gameIds.find((gId) => gId === gameId && existsSync(this.historyFilename(gameId, 0)));
    if (found === undefined) {
      throw new Error(`${gameId} not found`);
    }
    const text = readFileSync(this.historyFilename(gameId, 0));
    const serializedGame = JSON.parse(text.toString()) as SerializedGame;
    return serializedGame.players.length;
  }

  loadCloneableGame(gameId: GameId): Promise<SerializedGame> {
    return this.getGameVersion(gameId, 0);
  }

  getGameIds(): Promise<Array<GameId>> {
    const gameIds: Array<GameId> = [];

    // TODO(kberg): use readdir since this is expected to be async anyway.
    readdirSync(this.dbFolder, {withFileTypes: true}).forEach((dirent: Dirent) => {
      const gameId = this.asGameId(dirent);
      if (gameId !== undefined) {
        gameIds.push(gameId);
      }
    });
    return Promise.resolve(gameIds);
  }

  restoreReferenceGame(_gameId: GameId): Promise<Game> {
    throw new Error('Does not work');
  }

  saveGameResults(_gameId: GameId, _players: number, _generations: number, _gameOptions: GameOptions, _scores: Array<Score>): void {
    // Not implemented
  }

  cleanGame(_gameId: GameId): Promise<void> {
    // Not implemented here.
    return Promise.resolve();
  }

  purgeUnfinishedGames(): Promise<void> {
    // Not implemented.
    return Promise.resolve();
  }

  async restoreGame(gameId: GameId, saveId: number): Promise<SerializedGame> {
    await copyFileSync(this.historyFilename(gameId, saveId), this.filename(gameId));
    return this.getGame(gameId);
  }

  deleteGameNbrSaves(gameId: GameId, rollbackCount: number): Promise<void> {
    if (rollbackCount <= 0) {
      console.error(`invalid rollback count for ${gameId}: ${rollbackCount}`);
      // Should this be an error?
      return Promise.resolve();
    }

    return this.getSaveIds(gameId).then((saveIds) => {
      const versionsToDelete = saveIds.slice(-rollbackCount);
      for (const version of versionsToDelete) {
        this.deleteVersion(gameId, version);
      }
      return undefined;
    });
  }

  public stats(): Promise<{[key: string]: string | number}> {
    return Promise.resolve({
      type: 'Local Filesystem',
      path: this.dbFolder.toString(),
      history_path: this.historyFolder.toString(),
    });
  }

  public storeParticipants(_entry: GameIdLedger): Promise<void> {
    // Not necessary.
    return Promise.resolve();
  }

  private asGameId(dirent: Dirent): GameId | undefined {
    if (!dirent.isFile()) return undefined;
    const re = /(.*).json/;
    const result = dirent.name.match(re);
    if (result === null) return undefined;
    return isGameId(result[1]) ? result[1] : undefined;
  }

  public getParticipants(): Promise<Array<GameIdLedger>> {
    const gameIds: Array<GameIdLedger> = [];

    // TODO(kberg): use readdir since this is expected to be async anyway.
    readdirSync(this.dbFolder, {withFileTypes: true}).forEach((dirent: Dirent) => {
      const gameId = this.asGameId(dirent);
      if (gameId !== undefined) {
        const text = readFileSync(this.filename(gameId));
        const game: SerializedGame = JSON.parse(text.toString());
        const participantIds: Array<PlayerId | SpectatorId> = game.players.map((p) => p.id);
        if (game.spectatorId) participantIds.push(game.spectatorId);
        gameIds.push({gameId, participantIds});
      }
    });
    return Promise.resolve(gameIds);
  }

  private deleteVersion(gameId: GameId, version: number) {
    unlinkSync(this.historyFilename(gameId, version));
  }
}
