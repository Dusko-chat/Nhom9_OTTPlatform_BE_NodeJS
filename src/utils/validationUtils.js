const validatePassword = (password) => {
  if (password.length < 8) {
    return 'Mật khẩu phải có ít nhất 8 ký tự';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Mật khẩu phải bao gồm ít nhất một chữ cái viết hoa';
  }
  if (!/\d/.test(password)) {
    return 'Mật khẩu phải bao gồm ít nhất một chữ số';
  }
  if (!/[@$!%*?&]/.test(password)) {
    return 'Mật khẩu phải bao gồm ít nhất một ký tự đặc biệt (@$!%*?&)';
  }
  return null; // hợp lệ
};

module.exports = {
  validatePassword,
};
