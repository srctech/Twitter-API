let express = require("express");
let path = require("path");
let { open } = require("sqlite");
let sqlite3 = require("sqlite3");
let jwt = require("jsonwebtoken");
let bcrypt = require("bcrypt");

let app = express();
app.use(express.json());

let db = null;
let dbPath = path.join(__dirname, "twitterClone.db");

let initializeDbAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });

    app.listen(3000, () => {
      console.log("Server Started");
    });
  } catch (error) {
    console.log(`Error is ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//API 1
app.post("/register/", async (request, response) => {
  let { username, password, name, gender } = request.body;

  let getUser = `select * from user where username = '${username}'`;
  let checkUser = await db.get(getUser);

  if (checkUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    let passwordLength = password.length;
    if (passwordLength < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      let hashedPassword = await bcrypt.hash(password, 10);
      console.log(hashedPassword);
      let query = `insert into user(name,username,password,gender)
                       values('${name}','${username}','${hashedPassword}','${gender}')`;
      let dbResponse = await db.run(query);
      response.send("User created successfully");
    }
  }
});

//API 2
app.post("/login/", async (request, response) => {
  let { username, password } = request.body;

  let getUser = `select * from user where username = '${username}'`;
  let checkUser = await db.get(getUser);

  if (checkUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let checkPassword = await bcrypt.compare(password, checkUser.password);
    if (checkPassword === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      let payload = { username: username };
      let jwtToken = jwt.sign(payload, "Secret_Key");
      console.log(jwtToken);
      response.send({ jwtToken });
    }
  }
});

//API 3

let authenticate = (request, response, next) => {
  let authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Secret_Key", (error, user) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = user.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticate, async (request, response) => {
  let { username } = request;
  let getUserIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(getUserIdQuery);

  let userId = getUserId.user_id;

  let followingIdQuery = `select follower.following_user_id from user join follower on 
                            user.user_id = follower.follower_user_id where user.user_id = ${userId}`;
  let followingIdResult = await db.all(followingIdQuery);

  let followingIds = [];
  for (let i of followingIdResult) {
    followingIds.push(i.following_user_id);
  }

  let query = `select user.username as username, 
                tweet.tweet as tweet,
                tweet.date_time as dateTime
                from user join tweet on user.user_id = tweet.user_id
                where tweet.user_id in (${followingIds}) order by tweet.date_time desc limit 4`;
  let dbResponse = await db.all(query);
  response.send(dbResponse);
});

//API 4

app.get("/user/following/", authenticate, async (request, response) => {
  let { username } = request;

  let getUserIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(getUserIdQuery);

  let userId = getUserId.user_id;

  let followingIdQuery = `select follower.following_user_id from user join follower on 
                            user.user_id = follower.follower_user_id where user.user_id = ${userId}`;
  let followingIdResult = await db.all(followingIdQuery);

  let followingIds = [];
  for (let i of followingIdResult) {
    followingIds.push(i.following_user_id);
  }

  let query = `select user.name as name from user where user.user_id in 
                (${followingIds}) `;
  let dbResponse = await db.all(query);
  response.send(dbResponse);
});

//API 5

app.get("/user/followers/", authenticate, async (request, response) => {
  let { username } = request;

  let getUserIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(getUserIdQuery);

  let userId = getUserId.user_id;

  let followersQuery = `select follower.follower_user_id from follower join user on
                          user.user_id = follower.following_user_id where user.user_id = ${userId}`;
  let followersResult = await db.all(followersQuery);

  let followers = [];
  for (let i of followersResult) {
    followers.push(i.follower_user_id);
  }

  let query = `select user.name as name from user where user_id in (${followers})`;
  let dbResponse = await db.all(query);
  response.send(dbResponse);
});

//API 6
app.get("/tweets/:tweetId/", authenticate, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;

  let getUserIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(getUserIdQuery);

  let userId = getUserId.user_id;

  let followingIdQuery = `select follower.following_user_id from user join follower on 
                            user.user_id = follower.follower_user_id where user.user_id = ${userId}`;
  let followingIdResult = await db.all(followingIdQuery);

  let followingIds = [];
  for (let i of followingIdResult) {
    followingIds.push(i.following_user_id);
  }

  let getTweetIdsQuery = `select tweet.tweet_id from tweet where tweet.user_id in 
                            (${followingIds})`;
  let getTweetIds = await db.all(getTweetIdsQuery);

  let tweetIds = [];
  for (let i of getTweetIds) {
    tweetIds.push(i.tweet_id);
  }

  let checkTweet = tweetIds.includes(parseInt(tweetId));

  if (checkTweet === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let query = `select tweet.tweet as tweet,
                  count(distinct like.like_id) as likes,
                  count(distinct reply.reply_id) as replies,
                  tweet.date_time as dateTime
                    from (tweet join reply on tweet.tweet_id = reply.tweet_id) as t join
                    like on like.tweet_id = tweet.tweet_id
                    where tweet.tweet_id = ${tweetId}`;
    let dbResponse = await db.get(query);
    response.send(dbResponse);
  }
});

//API 7
app.get("/tweets/:tweetId/likes/", authenticate, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;

  let getUserIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(getUserIdQuery);

  let userId = getUserId.user_id;

  let followingIdQuery = `select follower.following_user_id from user join follower on 
                            user.user_id = follower.follower_user_id where user.user_id = ${userId}`;
  let followingIdResult = await db.all(followingIdQuery);

  let followingIds = [];
  for (let i of followingIdResult) {
    followingIds.push(i.following_user_id);
  }

  let getTweetIdsQuery = `select tweet.tweet_id from tweet where tweet.user_id in 
                            (${followingIds})`;
  let getTweetIds = await db.all(getTweetIdsQuery);

  let tweetIds = [];
  for (let i of getTweetIds) {
    tweetIds.push(i.tweet_id);
  }

  let checkTweet = tweetIds.includes(parseInt(tweetId));

  if (checkTweet === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let query = `select user.username as username from 
                    user join like on user.user_id = like.user_id
                    where like.tweet_id = ${tweetId}`;
    let dbResponse = await db.all(query);

    let liked = [];
    for (let i of dbResponse) {
      liked.push(i.username);
    }

    let likes = { likes: liked };
    response.send(likes);
  }
});

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;

    let getUserIdQuery = `select user_id from user where username = '${username}'`;
    let getUserId = await db.get(getUserIdQuery);

    let userId = getUserId.user_id;

    let followingIdQuery = `select follower.following_user_id from user join follower on 
                            user.user_id = follower.follower_user_id where user.user_id = ${userId}`;
    let followingIdResult = await db.all(followingIdQuery);

    let followingIds = [];
    for (let i of followingIdResult) {
      followingIds.push(i.following_user_id);
    }

    let getTweetIdsQuery = `select tweet.tweet_id from tweet where tweet.user_id in 
                            (${followingIds})`;
    let getTweetIds = await db.all(getTweetIdsQuery);

    let tweetIds = [];
    for (let i of getTweetIds) {
      tweetIds.push(i.tweet_id);
    }

    let checkTweet = tweetIds.includes(parseInt(tweetId));

    if (checkTweet === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let query = `select user.name as name,
                      reply.reply as reply from 
                      (user join reply on user.user_id = reply.user_id) as t join
                      tweet on reply.tweet_id = tweet.tweet_id where tweet.tweet_id = ${tweetId}`;
      let dbResponse = await db.all(query);
      let replies = { replies: dbResponse };
      response.send(replies);
    }
  }
);

//API 9
app.get("/user/tweets/", authenticate, async (request, response) => {
  let { username } = request;

  let getUserIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(getUserIdQuery);

  let userId = getUserId.user_id;

  let query = `select tweet.tweet,
                count(distinct like.like_id) as likes,
                count(distinct reply.reply_id) as replies,
                tweet.date_time as dateTime 
                from (tweet join like on tweet.tweet_id = like.tweet_id) as t join 
                        reply on tweet.tweet_id = reply.tweet_id
                        where tweet.user_id = ${userId}
                        group by tweet.tweet_id`;
  let dbResponse = await db.all(query);
  response.send(dbResponse);
});

//API 10
app.post("/user/tweets/", authenticate, async (request, response) => {
  let { tweet } = request.body;
  let { username } = request;

  let getUserIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(getUserIdQuery);

  let userId = getUserId.user_id;

  let query = `insert into tweet(tweet,user_id)
                    values('${tweet}',${userId})`;
  let dbResponse = await db.run(query);
  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;

  let getUserIdQuery = `select user_id from user where username = '${username}'`;
  let getUserId = await db.get(getUserIdQuery);

  let userId = getUserId.user_id;

  let getTweetsIdsQuery = `select tweet_id from tweet where user_id = ${userId}`;
  let getTweetsIds = await db.all(getTweetsIdsQuery);

  tweetIds = [];
  for (let i of getTweetsIds) {
    tweetIds.push(i.tweet_id);
  }

  let checkTweet = tweetIds.includes(parseInt(tweetId));

  if (checkTweet === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let query = `delete from tweet where tweet_id = ${tweetId}`;
    let dbResponse = await db.run(query);
    response.send("Tweet Removed");
  }
});

module.exports = app;
