const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vy1ux.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollection = client.db('medicalDB').collection('users')
        const campCollection = client.db('medicalDB').collection('camps')
        const joinCampCollection = client.db('medicalDB').collection('join')

        // jwt releted api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
            res.send({ token })
        })

        //middlewere
        const verifyToken = (req, res, next) => {
            // console.log('inside verifyToken', req.headers.authorization)
            if (!req.headers.authorization) {
                return res.status(401).send({ massage: 'unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ massage: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        };
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ massage: 'forbidden  access' })
            }
            next();
        }


        // users releted api 
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        })
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await userCollection.findOne(query);
            res.send(result);
        })
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ massage: 'forbidden  access' })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let admin = false;
            if (user) {
                admin = user?.role === "admin";
            }
            res.send({ admin })
        })
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'user already exists ' })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })
        // user-profile-update
        app.patch('/update-profile/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: req.body
            }
            const result = await userCollection.updateOne(filter, updatedDoc, options)
            res.send(result);
        })
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })


        // join camps releted api
        app.get('/join-camps', async (req, res) => {
            const email = req.query.participantEmail;
            const query = { participantEmail: email };
            const result = await joinCampCollection.find(query).toArray();
            res.send(result)
        })
        app.post('/join-camps', async (req, res) => {
            const joinCamp = req.body;
            const result = await joinCampCollection.insertOne(joinCamp);

            const id = joinCamp.campId;
            const query = { _id: new ObjectId(id) }
            const job = await campCollection.findOne(query);

            let newCount = 0;
            if (job.participantCount) {
                newCount = job.participantCount + 1;
            }
            else {
                newCount = 1;
            }
            // now update the camp info
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    participantCount: newCount
                }
            }
            const updateResult = await campCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })
        app.delete('/join-camp/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await joinCampCollection.deleteOne(query);
            res.send(result);
        })


        // camps releted api
        app.get("/highest-participant-count", async (req, res) => {
            const cursor = campCollection.find();
            const result = await cursor.sort({ participantCount: -1 }).limit(6).toArray();
            res.send(result)
        })
        app.get('/camps', async (req, res) => {
            const search = req.query.search;
            let query = {}
            if (search) {
                query.$or = [
                    { campName: { $regex: search, $options: 'i' } },
                    { date: { $regex: search, $options: 'i' } }
                ];
            }
            const result = await campCollection.find(query).toArray();
            res.send(result)
        })
        app.get('/camp-details/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await campCollection.findOne(query);
            res.send(result);
        })
        app.get('/camps/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await campCollection.findOne(query);
            res.send(result);
        })
        app.post('/camps', verifyToken, verifyAdmin, async (req, res) => {
            const camp = req.body;
            const result = await campCollection.insertOne(camp);
            res.send(result)
        })
        app.patch('/update-camp/:id', verifyToken, verifyAdmin, async (req, res) => {
            const camp = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDuc = {
                $set: {
                    campName: camp.campName,
                    image: camp.image,
                    price: camp.price,
                    date: camp.date,
                    location: camp.location,
                    healthcareName: camp.healthcareName,
                    description: camp.description
                }
            }
            const result = await campCollection.updateOne(filter, updateDuc);
            res.send(result);
        })
        app.delete('/delete-camp/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await campCollection.deleteOne(query);
            res.send(result);
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Medical Camp Management server is running...')
})
app.listen(port, () => {
    console.log(`Medical Camp Management server is running port : ${port}`)
})