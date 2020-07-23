const mongoose = require('mongoose')

const UserAuthSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      required: false,
    },
  }
)

module.exports = mongoose.model('UserAuth', UserAuthSchema)
