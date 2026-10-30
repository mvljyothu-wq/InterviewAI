/**
 * InterviewAI – Authentication Module
 */

const Auth = {
  // Simple hash (for demo — use bcrypt in production)
  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return h.toString(16);
  },

  register({ name, email, password }) {
    if (!name || !email || !password) throw new Error('All fields are required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    const hashed = this._hash(password);
    const user = DB.createUser({ name, email, password: hashed });
    DB.setCurrentUser({ id: user.id, name: user.name, email: user.email });
    return { id: user.id, name: user.name, email: user.email };
  },

  login({ email, password }) {
    if (!email || !password) throw new Error('Email and password are required');
    const user = DB.getUserByEmail(email);
    if (!user) throw new Error('No account found with this email');
    const hashed = this._hash(password);
    if (user.password !== hashed) throw new Error('Incorrect password');
    const profile = { id: user.id, name: user.name, email: user.email };
    DB.setCurrentUser(profile);
    return profile;
  },

  logout() { DB.clearCurrentUser(); },

  getUser() { return DB.getCurrentUser(); },

  requireAuth() {
    const user = this.getUser();
    if (!user) { Router.navigate('auth'); return null; }
    return user;
  },
};

window.Auth = Auth;
