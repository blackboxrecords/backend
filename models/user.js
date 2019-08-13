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
  email: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: false,
  },
  lastSynced: {
    type: Date,
    required: false,
  },
})

mongoose.model('User', UserSchema)
