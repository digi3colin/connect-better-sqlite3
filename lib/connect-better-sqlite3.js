/**
 * Connect - SQLite3
 * Copyright(c) 2012 David Feinberg
 * MIT Licensed
 * forked from https://github.com/tnantoka/connect-sqlite
 */

/**
 * Module dependencies.
 */
const Database = require('better-sqlite3');
const events = require('events');

/**
 * @type {Integer}  One day in milliseconds.
 */
const oneDay = 86400000;

/**
 * Return the SQLiteStore extending connect's session Store.
 *
 * @param   {object}    connect
 * @return  {Function}
 * @api     public
 */
module.exports = function(connect) {
    /**
     * Connect's Store.
     */
    const Store = (connect.session) ? connect.session.Store : connect.Store;

    /**
     * Remove expired sessions from database.
     * @param   {Object}    store
     * @api     private
     */
    function dbCleanup(store) {
        const now = new Date().getTime();
        store.db.prepare('DELETE FROM ' + store.table + ' WHERE ? > expired').run(now);
    }

    /**
     * Inherit from Store.
     */
    class SQLiteStore extends Store{
        /**
         * Initialize SQLiteStore with the given options.
         *
         * @param   {Object}    options
         * @api     public
         */

        constructor(options = {}){
            super(options);

            this.table = options.table || 'sessions';
            const db = (options.db || this.table)+'.sqlite';
            let dbPath;

            if (db.indexOf(':memory:') > -1 || db.indexOf('?mode=memory') > -1) {
                dbPath = db;
            } else {
                dbPath = (options.dir || '.') + '/' + db;
            }

            this.db = new Database(dbPath);
            this.client = new events.EventEmitter();

            if(options.concurrentDb) this.db.pragma('journal_mode = WAL');
            this.db.prepare('CREATE TABLE IF NOT EXISTS ' + this.table + ' (' + 'sid PRIMARY KEY, ' + 'expired, sess)').run();

            this.client.emit('connect');

            dbCleanup(this);
            setInterval(() => dbCleanup(this), oneDay, this).unref();
        }

        /**
         * Attempt to fetch session by the given sid.
         *
         * @param   {String}    sid
         * @param   {Function}  fn
         * @api     public
         */
        get (sid, fn){
            try{
                const now = new Date().getTime();
                const row = this.db.prepare('SELECT sess FROM ' + this.table + ' WHERE sid = ? AND ? <= expired').get(sid, now);

                if(fn){
                    if(!row) return fn();
                    fn(null, JSON.parse(row.sess));
                }

            } catch (err) {
                if (fn) fn(err);
            }
        };

        /**
         * Commit the given `sess` object associated with the given `sid`.
         *
         * @param   {String}    sid
         * @param   {Session}   sess
         * @param   {Function}  fn
         * @api     public
         */
        set(sid, sess, fn){
            try {
                const maxAge = sess.cookie.maxAge;
                const now = new Date().getTime();
                const expired = maxAge ? now + maxAge : now + oneDay;
                sess = JSON.stringify(sess);

                this.db.prepare('INSERT OR REPLACE INTO ' + this.table + ' VALUES (?, ?, ?)').run(sid, expired, sess);

                if(fn)fn(null, true);
            } catch (err) {
                if (fn) fn(err);
            }
        };

        /**
         * Destroy the session associated with the given `sid`.
         *
         * @param   {String}    sid
         * @api     public
         */
        destroy(sid, fn){
            try{
                this.db.prepare('DELETE FROM ' + this.table + ' WHERE sid = ?').run(sid);

                if(fn)fn(null, true);
            } catch (err) {
                if (fn) fn(err);
            }
        };

        /**
         * Fetch number of sessions.
         *
         * @param   {Function}  fn
         * @api     public
         */
        length(fn){
            try{
                const rows = this.db.prepare('SELECT COUNT(*) AS count FROM ' + this.table).all();

                if(fn)fn(null, rows[0].count);
            }catch(err) {
                if (fn) fn(err);
            }
        };


        /**
         * Clear all sessions.
         *
         * @param   {Function}  fn
         * @api     public
         */
        clear(fn){
            try{
                this.db.prepare('DELETE FROM ' + this.table).run();

                if(fn) fun(null, true);
            }catch(err) {
                if (fn) fn(err);
            }
        };

        /**
         * Touch the given session object associated with the given session ID.
         *
         * @param   {string}    sid
         * @param   {object}    session
         * @param   {function}  fn
         * @public
         */
        touch(sid, session, fn){
            if (!(session && session.cookie && session.cookie.expires))return;

            try {
                const now = new Date().getTime();
                const cookieExpires = new Date(session.cookie.expires).getTime();
                this.db.prepare('UPDATE ' + this.table + ' SET expired=? WHERE sid = ? AND ? <= expired').run(cookieExpires, sid, now);

                if (fn) fun(null, true);
            } catch (err) {
                if (fn) fn(err);
            }
        }
    }

    return SQLiteStore;
};
