document.getElementById('msLoginBtn').addEventListener('click', function() {
  const email = document.getElementById('email').value;
  MemberStack.onReady.then(function(member) {
    MemberStack.login({ email: email }).then(function() {
      if (MemberStack.loggedIn) {
        document.getElementById('paidContent').style.display = 'block';
        document.getElementById('loginSection').style.display = 'none';
      }
    }).catch(function(err){
      document.getElementById('loginMsg').textContent = 'Access denied. Please purchase membership.';
    });
  });
});
