export const authService = {
  isReal: () => true,

  signIn: async (
    emailOrUsn: string,
    pin: string,
    role: 'lecturer' | 'student' | 'admin'
  ): Promise<{ codeOrUsn: string; name: string }> => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailOrUsn.trim(), password: pin, role })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Sign-in failed.');
    }

    if (role === 'lecturer') localStorage.setItem('sjce_auth_session_lecturer', JSON.stringify(data.user));
    if (role === 'student') localStorage.setItem('sjce_auth_session_student', JSON.stringify(data.user));
    if (role === 'admin') localStorage.setItem('sjce_auth_session_admin', JSON.stringify(data.user));
    
    // Store JWT
    localStorage.setItem(`sjce_auth_token_${role}`, data.token);

    return { codeOrUsn: data.user.codeOrUsn, name: data.user.name };
  },

  signUp: async (
    emailOrUsn: string,
    pin: string,
    name: string,
    role: 'lecturer' | 'student'
  ): Promise<{ codeOrUsn: string; name: string }> => {
    const clean = emailOrUsn.trim();

    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsn: clean, pin, name, role })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed.');
    }

    if (role === 'lecturer') localStorage.setItem('sjce_auth_session_lecturer', JSON.stringify(data.user));
    if (role === 'student') localStorage.setItem('sjce_auth_session_student', JSON.stringify(data.user));

    // Store JWT
    localStorage.setItem(`sjce_auth_token_${role}`, data.token);

    // Also register student in the server roster DB
    if (role === 'student') {
      try {
        await fetch('/api/students', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.token}`
          },
          body: JSON.stringify({
            usn: clean.toUpperCase(),
            name,
            attendanceRate: 100,
            courseCode: 'CSE',
            section: 'A',
            year: 1,
            avatarUrl: ''
          })
        });
      } catch (e) {
        console.warn('Student roster registration failed:', e);
      }
    }
    return { codeOrUsn: data.user.codeOrUsn, name: data.user.name };
  },

  signOut: async () => {
    localStorage.removeItem('sjce_auth_session_lecturer');
    localStorage.removeItem('sjce_auth_session_admin');
    localStorage.removeItem('sjce_auth_session_student');
    localStorage.removeItem('sjce_auth_token_lecturer');
    localStorage.removeItem('sjce_auth_token_admin');
    localStorage.removeItem('sjce_auth_token_student');
  }
};
