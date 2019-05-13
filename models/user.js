const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: false,
  },
  accessToken: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  scope: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
})

mongoose.model('User', UserSchema)
