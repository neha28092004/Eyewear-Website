import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import path from 'path';
import * as faceapi from 'face-api.js';
import session from 'express-session';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// Initialize Stripe instance
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // Use the loaded key

// Get the current directory (equivalent of __dirname in CommonJS)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 4000;
const saltRounds = 10;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "eyewear",
  password: "neha2004",
  port: 5432,
});
db.connect();

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use('/myCss', express.static('myCss'));
app.use('/photos', express.static('photos'));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
app.use('/models', express.static(path.join(__dirname, 'models')));
app.use(express.static('views', { extensions: ['js'] }))
app.use('/Virtual-Try-On', express.static(path.join(__dirname, 'Virtual-Try-On')));
app.use(session({
  secret: 'process.env.SESSION_SECRET', // Keep this secure, use environment variables in production
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/book-appointment", (req, res) => {
  res.render("eyetest"); 
});

app.get("/tryon", (req, res) => {
  res.redirect("http://127.0.0.1:8080/Virtual-Glasses-Try-on-main/");
});

app.get("/about", (req, res) => {
  res.render("about.ejs");
});

app.get("/contact", (req, res) => {
  res.render("contact.ejs");
});

app.get("/eyetest", (req, res) => {
  res.render("eyetest.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

// Route to display products page
app.get('/products', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products');
    res.render('products', { products: result.rows }); // Render products.ejs with products data
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching products');
  }
});

// Route for displaying individual product details
app.get('/product/:id', async (req, res) => {
  const productId = parseInt(req.params.id, 10);  // Convert ID to integer

  // Check if productId is a valid number
  if (isNaN(productId)) {
    return res.status(400).send('Invalid product ID');
  }

  try {
    const result = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (result.rows.length > 0) {
      // Render the product-detail page and pass the product data
      res.render('product-detail', { product: result.rows[0] });
    } else {
      // If no product found, return 404 error
      res.status(404).send('Product not found');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching product details');
  }
});
//register button
app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      res.send("Email already exists. Try logging in.");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          console.log("Hashed Password:", hash);
          await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2)",
            [email, hash]
          );
          res.render("home.ejs");
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
 
});
//login button
app.post("/login", async (req, res) => {
  const email = req.body.username;
  const loginPassword = req.body.password;

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const storedHashedPassword = user.password;

      bcrypt.compare(loginPassword, storedHashedPassword, (err, isMatch) => {
        if (err) {
          console.error("Error comparing passwords:", err);
          return res.status(500).send("Internal Server Error");
        }

        if (isMatch) {
          req.session.userId = user.id;
          req.session.username = user.email;

          // Fix: Redirect to product details page instead of /cart/add/:productId
          const redirectUrl = req.session.redirectTo || "/products";
          
          // If redirect URL contains /cart/add/, send user to product details page instead
          if (redirectUrl.includes("/cart/add/")) {
            const productId = redirectUrl.split("/cart/add/")[1]; // Extract product ID
            return res.redirect(`/product/${productId}`); // Redirect to product details page
          }

          delete req.session.redirectTo; // Clear stored URL
          return res.redirect(redirectUrl);
        } else {
          res.send("Incorrect Password");
        }
      });
    } else {
      res.send("User not found");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing your request");
  }
});



//view cart route
app.get('/cart', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  let totalAmount = 0;
  const cartProducts = [];

  if (req.session.cart && req.session.cart.length > 0) {
    for (let item of req.session.cart) {
      const product = await db.query('SELECT * FROM products WHERE id = $1', [item.productId]);
      if (product.rows.length > 0) {
        const productData = {
          ...product.rows[0],
          quantity: item.quantity,
        };
        cartProducts.push(productData);
        totalAmount += productData.price * item.quantity;
      }
    }
  }

  console.log("Cart Data Sent to cart.ejs:", cartProducts);
  console.log("Total Amount Sent to cart.ejs:", totalAmount);

  res.render('cart', { 
    cart: cartProducts, 
    totalAmount: parseFloat(totalAmount) || 0, 
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY 
  });
});



//modify cart 
// Route to update the cart
app.post('/cart/update', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  if (!req.session.cart) {
    req.session.cart = [];
  }

  const productId = parseInt(req.body.productId, 10);
  const quantity = parseInt(req.body.quantity, 10);

  if (isNaN(productId) || isNaN(quantity) || quantity <= 0) {
    return res.status(400).send('Invalid product ID or quantity');
  }

  const productIndex = req.session.cart.findIndex(item => item.productId === productId);

  if (productIndex >= 0) {
    req.session.cart[productIndex].quantity = quantity;
  }

  res.redirect('/cart');
});

//remove cart
app.post('/cart/remove', (req, res) => {
  if (!req.session.cart) {
    req.session.cart = [];
  }

  const productId = parseInt(req.body.productId, 10);
  if (isNaN(productId)) {
    return res.status(400).send('Invalid product ID');
  }

  req.session.cart = req.session.cart.filter(item => item.productId !== productId);
  res.redirect('/cart');
});


//add product to cart
app.post('/cart/add/:productId', async (req, res) => {
  if (!req.session.userId) {
    req.session.redirectTo = req.originalUrl;
    return res.redirect('/login');
  }

  const productId = parseInt(req.params.productId, 10);
  const quantity = parseInt(req.body.quantity, 10) || 1;

  if (!req.session.cart) {
    req.session.cart = [];
  }

  const existingProductIndex = req.session.cart.findIndex(item => item.productId === productId);

  if (existingProductIndex >= 0) {
    req.session.cart[existingProductIndex].quantity += quantity;
  } else {
    req.session.cart.push({ productId, quantity });
  }

  res.redirect('/cart');
});


// Remove product from the cart
app.post('/cart/remove/:productId', (req, res) => {
  const productId = req.params.productId;

  // Remove the product from the cart
  req.session.cart = req.session.cart.filter(item => item.productId !== productId);

  res.redirect('/cart');  // Redirect back to the cart page
});

app.get("/order-success", (req, res) => {
  res.render("order-success"); // Make sure you have order-success.ejs in views folder
});

// Route to create a Stripe payment intent
app.post("/create-payment-intent", express.json(), async (req, res) => {
  try {
    console.log("Received Body:", req.body); // Debugging log
    const { amount, shippingAddress } = req.body;

    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      console.error("Invalid amount received:", amount);
      return res.status(400).json({ error: "Invalid amount received: " + amount });
    }

    console.log("Processing payment for amount:", amount); // Debugging log

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert INR to paise
      currency: "INR",
      payment_method_types: ["card"],
      metadata: { shippingAddress }
    });

    console.log("Payment Intent Created:", paymentIntent.id); // Debugging log

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Stripe Payment Intent Error:", error);
    res.status(500).json({ error: error.message });
  }
});



//checkout route
app.post('/checkout', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  if (!req.session.cart || req.session.cart.length === 0) {
    return res.status(400).send('Your cart is empty.');
  }

  const userId = req.session.userId;
  const shippingAddress = req.body.shippingAddress;
  let totalPrice = 0;

  try {
    // Calculate total price
    for (let item of req.session.cart) {
      const product = await db.query('SELECT price FROM products WHERE id = $1', [item.productId]);
      if (product.rows.length > 0) {
        totalPrice += product.rows[0].price * item.quantity;
      }
    }

    // Insert order into 'orders' table
    const result = await db.query(
      'INSERT INTO orders (user_id, total_price, shipping_address) VALUES ($1, $2, $3) RETURNING id',
      [userId, totalPrice, shippingAddress]
    );

    const orderId = result.rows[0].id;

    // Save each item in 'order_items' with price
    for (let item of req.session.cart) {
      const product = await db.query('SELECT price FROM products WHERE id = $1', [item.productId]);
      
      if (product.rows.length > 0) {
        const productPrice = product.rows[0].price;  // Get price from 'products' table

        await db.query(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
          [orderId, item.productId, item.quantity, productPrice]
        );
      }
    }

    req.session.cart = [];  // Clear cart after order

    res.redirect(`/order/${orderId}`);
  } catch (err) {
    console.error("Error processing order:", err);
    res.status(500).send("Error processing order.");
  }
});

// Route to create a Stripe checkout session
app.post("/create-checkout-session", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "User not logged in" });
  }

  try {
    console.log("🚀 DEBUG: Received request for checkout session:", req.body);

    let totalAmount = parseFloat(req.body.totalAmount);
    const shippingAddress = req.body.shippingAddress;
    const cart = req.body.cart;

    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      console.error("❌ ERROR: Invalid total amount:", totalAmount);
      return res.status(400).json({ error: "Invalid total amount received" });
    }

    if (!Array.isArray(cart) || cart.length === 0) {
      console.error("❌ ERROR: Invalid or empty cart.");
      return res.status(400).json({ error: "Invalid cart data." });
    }

    console.log("🚀 DEBUG: Creating Stripe session for user:", req.session.userId);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: cart.map(item => ({
        price_data: {
          currency: "INR",
          product_data: { name: item.name },
          unit_amount: Math.round(parseFloat(item.price) * 100),
        },
        quantity: item.quantity,
      })),
      mode: "payment",
      success_url: `http://localhost:4000/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:4000/cart`,
      customer_email: req.session.username,
    });

    console.log("🚀 DEBUG: Stripe session created:", session.id);

    // ✅ Insert the order into the database
    console.log("🚀 DEBUG: Storing order in database...");

    const orderQuery = `
      INSERT INTO orders (user_id, total_price, shipping_address) 
      VALUES ($1, $2, $3) RETURNING id
    `;

    const orderResult = await db.query(orderQuery, [
      req.session.userId,
      totalAmount,
      shippingAddress,
    ]);

    const orderId = orderResult.rows[0].id;
    console.log("🚀 DEBUG: Order inserted with ID:", orderId);

    // ✅ Insert order items into `order_items` table with `price`
    for (const item of cart) {
      const productResult = await db.query(
        "SELECT price FROM products WHERE id = $1",
        [item.id]
      );

      if (productResult.rows.length > 0) {
        const productPrice = productResult.rows[0].price; // Get price from products table

        const insertItemQuery = `
          INSERT INTO order_items (order_id, product_id, quantity, price) 
          VALUES ($1, $2, $3, $4)
        `;

        await db.query(insertItemQuery, [orderId, item.id, item.quantity, productPrice]);
      } else {
        console.error("❌ ERROR: Product price not found for product ID:", item.id);
      }
    }

    console.log("🚀 DEBUG: Order items inserted successfully.");

    res.json({ url: session.url });

  } catch (error) {
    console.error("❌ ERROR: Error processing checkout:", error);
    res.status(500).json({ error: "Error processing checkout." });
  }
});






// Stripe Webhook to capture successful payments and store orders
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const totalAmount = session.amount_total / 100;
    const userEmail = session.customer_email;

    const userResult = await db.query("SELECT id FROM users WHERE email = $1", [userEmail]);
    if (userResult.rows.length === 0) return res.status(400).send("User not found");
    const userId = userResult.rows[0].id;

    const orderResult = await db.query(
      "INSERT INTO orders (user_id, total_price, status) VALUES ($1, $2, $3) RETURNING id",
      [userId, totalAmount, "Paid"]
    );
    const orderId = orderResult.rows[0].id;

    req.session.cart.forEach(async (item) => {
      await db.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)",
        [orderId, item.productId, item.quantity, item.price]
      );
    });
    req.session.cart = [];
  }
  res.json({ received: true });
});


// Route to display order success page with details
app.get("/order-success", async (req, res) => {
  if (!req.session.userId) {
    console.log("❌ ERROR: User not logged in, redirecting to login.");
    return res.redirect("/login");
  }

  try {
    console.log("🚀 DEBUG: Fetching last order for user ID:", req.session.userId);

    // ✅ Fetch the most recent order for the logged-in user
    const orderResult = await db.query(
      "SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
      [req.session.userId]
    );

    console.log("🚀 DEBUG: Order Query Result:", orderResult.rows);

    if (orderResult.rows.length === 0) {
      console.error("❌ ERROR: No orders found for user.");
      return res.status(400).send("No recent orders found.");
    }

    const order = orderResult.rows[0];
    console.log("🚀 DEBUG: Order found:", order);

    // ✅ Fetch the order items related to this order
    const orderItemsResult = await db.query(
      `SELECT order_items.quantity, order_items.price, products.name, products.image_url 
       FROM order_items 
       JOIN products ON order_items.product_id = products.id 
       WHERE order_items.order_id = $1`,
      [order.id]
    );

    console.log("🚀 DEBUG: Order items found:", orderItemsResult.rows);

    if (orderItemsResult.rows.length === 0) {
      console.warn("⚠ WARNING: No order items found for this order.");
    }

    // ✅ Render `order-success.ejs` with order details
    res.render("order-success", {
      order: order,                 // Pass the order details
      items: orderItemsResult.rows,  // Pass purchased items with product details
      shippingAddress: order.shipping_address || "No address provided", // Handle missing address
    });

  } catch (error) {
    console.error("❌ ERROR: Error fetching order details:", error);
    res.status(500).send("Error fetching order details.");
  }
});



//order confirmation
app.get('/order/:orderId', async (req, res) => {
  const orderId = req.params.orderId;

  try {
    const order = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const orderItems = await db.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);

    const products = [];
    for (let item of orderItems.rows) {
      const product = await db.query('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (product.rows.length > 0) {
        products.push({
          ...product.rows[0],
          quantity: item.quantity,
        });
      }
    }

    res.render('order-confirmation', { order: order.rows[0], items: products });
  } catch (err) {
    console.error("Error fetching order:", err);
    res.status(500).send("Error fetching order.");
  }
});



//contact page submit button
app.post("/submit", async (req, res) => {
  const { name, email, message } = req.body;

  try {
     // Insert the data into the PostgreSQL database
    const query = 'INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3)';
    await db.query(query, [name, email, message]);

    // Send a success response
    res.send('Thank you for your message! We will get back to you soon.');

  } catch (err) {
    console.error('Error inserting data:', err);
    res.status(500).send('Something went wrong. Please try again later.');
}

});
//appointment page button
app.post("/book-appointment", async (req, res) => {
  const { name, email, appointmentDate, appointmentTime } = req.body;

  try {
    // Save appointment to PostgreSQL
    const query = 'INSERT INTO appointments (name, email, appointment_date, appointment_time) VALUES ($1, $2, $3, $4)';
    await db.query(query, [name, email, appointmentDate, appointmentTime]);

    // After saving, redirect to a confirmation page or show a success message
    res.render('appointment-success', { name });
  } catch (err) {
    console.error('Error saving appointment', err);
    res.status(500).send('There was an error booking your appointment. Please try again later.');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
