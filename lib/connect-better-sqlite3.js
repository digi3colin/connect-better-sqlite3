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

/**
 * @type {Integer}  One day in milliseconds.
 */
const ONE_DAY = 86400000;
const FIVE_MINUTES = 300000;
/**
 * Return the SQLiteStore extending connect's session Store.
 *
 * @param   {object}    connect
 * @return  {Function}
 * @api     public
 */
module.exports = function(connect) {
  /**
   * Inherit from Store.
   */
  class SQLiteStore{
    /**
     * Initialize SQLiteStore with the given options.
     *
     * @param   {Object}    options
     * @api     public
     */

    constructor(options = {}){
      this.connections = {};
      this.table = options.table || 'sessions';
      const db = (options.db || this.table)+'.sqlite';
      this.dbPath = (options.dir || '.') + '/' + db;

      this.dbCleanup();
      //clean up session everyday.
      setInterval(() => {
        this.dbCleanup();
      }, ONE_DAY).unref();

      //reset checkpoint every five minutes
      setInterval(() => {
        Object.keys(this.connections).forEach(x => {
          this.connections[x].checkpoint = false;
        });
      }, FIVE_MINUTES).unref();
    }

    /**
     * Remove expired sessions from database.
     * @param   {Object}    store
     * @api     private
     */
    dbCleanup() {
      Object.keys(this.connections).forEach(x => {
        this.connections[x].db.prepare('DELETE FROM ' + this.table + ' WHERE ? > expired').run(Date.now())
      });
    }

    getConnection(request){
      if(!request){
        this.connections['default'] = this.connections['default'] || {db : new Database(this.dbPath), checkpoint: false};
        return this.connections['default'];
      }
      const host = request.headers.host.split(':')[0];
      const path = `../sites/${host}/db/sessions.sqlite`;
      this.connections[host] = this.connections[host] || {db: new Database(path), checkpoint: false};
      return this.connections[host];
    }

    /**
     * Attempt to fetch session by the given sid.
     *
     * @param   {String}    sid
     * @param   {Function}  fn
     * @api     public
     */
    get (sid, fn, opts={}){
      try{
        const db = this.getConnection(opts.request).db;
        const row = db.prepare('SELECT sess FROM ' + this.table + ' WHERE sid = ? AND ? <= expired').get(sid, Date.now());

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
    set(sid, sess, fn, opts={}){
      try {
        const maxAge = sess.cookie.maxAge;
        const now = new Date().getTime();
        const expired = maxAge ? now + maxAge : now + ONE_DAY;
        sess = JSON.stringify(sess);

        const connection = this.getConnection(opts.request);
        const db = connection.db;
        db.prepare('INSERT OR REPLACE INTO ' + this.table + ' VALUES (?, ?, ?)').run(sid, expired, sess);
        if(!connection.checkpoint){
          db.prepare('PRAGMA wal_checkpoint(FULL)').run();
          connection.checkpoint = true;
        }

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
    destroy(sid, fn, opts={}){
      try{
        const db = this.getConnection(opts.request).db;
        db.prepare('DELETE FROM ' + this.table + ' WHERE sid = ?').run(sid);

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
    length(fn, opts={}){
      try{
        const db = this.getConnection(opts.request).db;
        const rows = db.prepare('SELECT COUNT(*) AS count FROM ' + this.table).all();

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
    clear(fn, opts={}){
      try{
        const db = this.getConnection(opts.request).db;
        db.prepare('DELETE FROM ' + this.table).run();

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
    touch(sid, session, fn, opts = {}){
      if (!(session && session.cookie && session.cookie.expires))return;

      try {
        const now = new Date().getTime();
        const cookieExpires = new Date(session.cookie.expires).getTime();
        const db = this.getConnection(opts.request).db;
        db.prepare('UPDATE ' + this.table + ' SET expired=? WHERE sid = ? AND ? <= expired').run(cookieExpires, sid, now);

        if (fn) fun(null, true);
      } catch (err) {
        if (fn) fn(err);
      }
    }
  }

  return SQLiteStore;
};
