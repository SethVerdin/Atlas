DROP TABLE IF EXISTS food_logs;
DROP TABLE IF EXISTS users;

-- Users Relation: Stores authentication credentials
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FoodLogs Relation: Stores the extracted nutritional JSON data
CREATE TABLE food_logs (
    log_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    raw_text TEXT NOT NULL,
    calories NUMERIC(5, 1),
    protein NUMERIC(5, 1),
    carbs NUMERIC(5, 1),
    fat NUMERIC(5, 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user
        FOREIGN KEY(user_id) 
        REFERENCES users(user_id)
        ON DELETE CASCADE
);