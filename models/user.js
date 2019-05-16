const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: false,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  scope: {
    type: String,
    required: true,
  },
})

mongoose.model('User', UserSchema)
