require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const cookieParser = require("cookie-parser");

const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true })); // Enable cookies
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));

//conex db
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Dante1123",
  database: "photography_site",
  port: "3306",
});

db.connect((err) => {
  if (err) throw err;
  console.log("✅ MySQL Connected...");
});

//jwt key
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

//middleware (+ protectie)
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
};

//signup
app.post(
  "/signup",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Invalid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password } = req.body;
    try {
      //interogare useri in db
      const checkUserSQL = "SELECT * FROM users WHERE email = ?";
      db.query(checkUserSQL, [email], async (err, results) => {
        if (results.length > 0) return res.status(400).json({ error: "User already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
        db.query(sql, [name, email, hashedPassword], (err, result) => {
          if (err) return res.status(500).json({ error: "Database error" });

          res.json({ message: "User registered successfully" });
        });
      });
    } catch (error) {
      res.status(500).json({ error: "Server error" });
    }
  }
);

//login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });

    if (results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });

    res
      .cookie("token", token, {
        httpOnly: true,
        secure: false, // Change to `true` in production with HTTPS
        sameSite: "lax",
      })
      .json({ message: "Login successful", token });
  });
});

//logout cookie 
app.post("/logout", (req, res) => {
  res.clearCookie("token").json({ message: "Logged out successfully" });
});

//GET profil user in db
app.get("/profile", authenticate, (req, res) => {
  const sql = "SELECT id, name, email FROM users WHERE id = ?";
  db.query(sql, [req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(result[0]);
  });
});

//depozit multer img
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

//upload img
app.post("/upload", authenticate, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const imageUrl = `http://localhost:5000/uploads/${req.file.filename}`;
  const sql = "INSERT INTO images (url, user_id) VALUES (?, ?)";
  db.query(sql, [imageUrl, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });

    res.json({ message: "Image uploaded", url: imageUrl });
  });
});

//interogare toate img in db
app.get("/images", (req, res) => {
  const sql = "SELECT * FROM images";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });

    res.json(results);
  });
});

//start
app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});

