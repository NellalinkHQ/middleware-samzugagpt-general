// ====== VERY TOP of app.js ======

// Override process.exit early
const originalProcessExit = process.exit;
process.exit = (code) => {
  throw new Error(`process.exit was called with code ${code}`);
};

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Optionally, you might want to log this error or attempt a graceful shutdown.
  // process.exit(1);  // Or decide not to exit if that's your intention.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Similarly, decide whether to shut down or continue.
});

// ====== Continue loading modules ======
require('dotenv').config(); // Load environment variables from .env file
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');

var indexRouter = require('./routes/index');
var workerRouter = require('./routes/worker');
var usersRouter = require('./routes/users');
var swapRouter = require('./routes/swap/index');
var withdrawalRouter = require('./routes/withdrawal/index');
var referralRouter = require('./routes/referral/index');
var cryptocurrencyRouter = require('./routes/cryptocurrency/index');
var stakingRouter = require('./routes/staking/index');
var workersRouter = require('./routes/workers/index');
var customRouter = require('./routes/custom/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors()); // Apply CORS middleware

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes setup
app.use('/', indexRouter);
app.use('/', workerRouter);
app.use('/users', usersRouter);
app.use('/swap', swapRouter);
app.use('/withdrawal', withdrawalRouter);
app.use('/referral', referralRouter);
app.use('/cryptocurrency', cryptocurrencyRouter);
app.use('/staking', stakingRouter);
app.use('/workers', workersRouter);
app.use('/custom', customRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
