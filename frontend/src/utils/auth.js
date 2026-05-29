export function saveAuth(token, user) {
  localStorage.setItem("trueme_token", token);
  localStorage.setItem("trueme_user", JSON.stringify(user));
}

export function getToken() {
  return localStorage.getItem("trueme_token");
}

export function getUser() {
  const user = localStorage.getItem("trueme_user");

  if (!user) return null;

  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem("trueme_token");
  localStorage.removeItem("trueme_user");
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function hasRole(allowedRoles) {
  const user = getUser();

  if (!user) return false;

  return allowedRoles.includes(user.role);
}