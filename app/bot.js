const Discord = require("discord.js");
const MySQL = require("mysql2/promise");
const Action = require("@actions/action");
const HelpActionHandler = require("@actionhandlers/helpactionhandler");
const NotesActionHandler = require("@actionhandlers/notesactionhandler");
const QuoteActionHandler = require("@actionhandlers/quoteactionhandler");

module.exports = class Bot {
  constructor(
    options = {},
    actions = [HelpActionHandler, NotesActionHandler, QuoteActionHandler],
    discord = Discord,
    mysql = MySQL
  ) {
    console.log(
      "*** Welcome to Corporal Lancot %s! ***",
      process.env.npm_package_version
    );

    this.actions = actions;
    this.options = options;
    this.discord = discord;
    this.mysql = mysql;

    if (!this.discord || !this.mysql || !this.actions || !this.options.key) {
      throw new Error("Missing required constructor dependencies!", this);
    }

    this.actions = this.actions.map((actionClass) => {
      return new actionClass(this);
    });
  }

  async init() {
    await this.initDB();
    await this.setupTable();
    await this.initDiscord();

    console.log("Initialisation complete");

    this.listen();
  }

  async initDB() {
    console.log("Connecting to database");

    this.db = await this.mysql.createConnection({
      host: this.options.dbHost || "localhost",
      user: this.options.dbUser,
      password: this.options.dbPassword,
      database: this.options.db || "notes",
    });

    this.notesTable = this.options.dbTable || "notes";

    console.log("Connected to database");
  }

  async setupTable() {
    console.log(`Checking '${this.options.dbTable}' table`);
    const [results, fields] = await this.db.query("SHOW TABLES LIKE ?;", [
      this.notesTable,
    ]);
    if (results && results.length > 0) {
      console.log(`'${this.options.dbTable}' table already exists`);
      return;
    }

    console.log(`'${this.options.dbTable}' table does not exist, creating`);
    await this.db.query(
      `CREATE TABLE ${this.options.dbTable} (
      id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
      timestamp DATETIME,
      user_id BIGINT(8),
      channel_id BIGINT(8),
      nick VARCHAR(255) NOT NULL,
      message LONGTEXT NOT NULL
  );`
    );

    console.log(`'${this.options.dbTable}' table created`);
  }

  initDiscord() {
    console.log("Logging in to Discord");
    return new Promise((resolve, reject) => {
      try {
        this.client = new this.discord.Client();
        this.client.once("ready", () => {
          console.log("Logged into Discord");
          resolve(true);
        });

        this.client.login(this.options.key);
      } catch (e) {
        reject(e);
      }
    });
  }

  async listen() {
    console.log("Listening for commands");
    this.client.on("message", this.listenHandler.bind(this));
  }

  async listenHandler(msg) {
    if (msg.content && msg.content[0] === "!") {
      const action = Action.getAction(msg.content);
      if (action && action.command) {
        let reply = "";
        const handler = this.actions.filter((x) => x.isMatch(action));
        if (!handler || !handler.length) {
          reply = "I don't recognise that command.";
        } else {
          try {
            reply = await handler[0].handle(action, msg);
          } catch (e) {
            reply = e;
          }
        }
        if (reply) {
          msg.reply(reply);
        }
      }
    }
  }
};
