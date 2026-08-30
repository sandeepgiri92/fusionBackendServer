require("dotenv").config();

const argon2 = require("argon2");
const mongoose = require("mongoose");
const User = require("./src/models/user");

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);

    const username = "fusion";
    const email = "sandeepgiri92@gmail.com";
    const password = "Sandeepgiri@92";

    const exitstingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (exitstingUser) {
      console.log("Admin already exists");
      process.exit(0);
    }

    const hashPassword = await argon2.hash(password);

    await User.create({
      username,
      email,
      password: hashPassword,
      role: "admin",
    });

    console.log("Admin creation successfuly");
    await mongoose.disconnect();
  } catch (err) {
    console.log("not working", err.message);
  }
};

createAdmin();
