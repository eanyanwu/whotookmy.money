import type { Database } from "better-sqlite3";
import config from "./config";
import Connection from "better-sqlite3";

const open = () => {
  const file = config.get("server").db_file;
  return new Connection(file);
};

/* MIGRATIONS {{{*/

class InvalidTargetVersion extends Error {
  constructor() {
    super("Invalid target version for migration");
  }
}

class CannotRevertMigration extends Error {
  constructor() {
    super("Reverse migration not defined");
  }
}

/* A single migration up/down definitions */
class M {
  u: string = "";
  d: string | null = null;

  private constructor(u: string, d: string | null) {
    this.u = u;
    this.d = d;
  }

  /* SQL statements to migrate forward */
  static up(s: string): M {
    return new M(s, null);
  }

  /* Optional SQL statements to migrate back */
  down(s: string) {
    this.d = s;
    return this;
  }
}

/* The set of defined migrations */
class Migrations {
  private ms: M[] = [];

  constructor(migrations: M[]) {
    this.ms = migrations;
  }

  /* Migrate to the lates migration */
  toLatest(conn: Database) {
    const targetVersion = this.ms.length;

    this.goto(conn, targetVersion);
  }

  /* Go to a given database version */
  goto(conn: Database, targetVersion: number) {
    let currentVersion = this.userVersion(conn);

    // The target version must point at one of the migrations we have defined
    if (targetVersion > this.ms.length || targetVersion < 0) {
      throw new InvalidTargetVersion();
    }

    let action: () => void;

    if (currentVersion === targetVersion) {
      console.log("no migration to run, db already up to date");
      return;
    } else if (targetVersion < currentVersion) {
      // Go down
      action = conn.transaction(() => {
        for (let i = currentVersion - 1; i >= targetVersion; i--) {
          try {
            let m = this.ms[i];
            if (!m.d) {
              throw new CannotRevertMigration();
            }
            conn.exec(m.d);
          } catch (e) {
            console.log(`reverse migration to version ${i} failed`);
            throw e;
          }
        }
      });
    } else {
      // Go up
      action = conn.transaction(() => {
        for (let i = currentVersion; i < targetVersion; i++) {
          try {
            let m = this.ms[i];
            conn.exec(m.u);
          } catch (e) {
            console.log(`migration to version ${i + 1} failed`);
            throw e;
          }
        }
      });
    }

    action();
    this.setUserVersion(conn, targetVersion);
  }

  /* The user_version integer in the sqlite file database header */
  userVersion(conn: Database): number {
    return conn.pragma("user_version", { simple: true });
  }

  /* Set the database user_version integer in the sqlite file database header */
  private setUserVersion(conn: Database, target: number) {
    conn.pragma(`user_version = ${target}`);
  }
}

/* }}}*/

export { M, Migrations, CannotRevertMigration, InvalidTargetVersion, open };
