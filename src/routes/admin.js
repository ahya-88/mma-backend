const express = require("express");
const { requireAuth, requireAdmin } = require("../auth");
const svc = require("../adminService");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/dashboard", (req,res,next)=>{try{res.json(svc.dashboard());}catch(e){next(e);}});
router.get("/guru",(req,res,next)=>{try{res.json(svc.listGuru());}catch(e){next(e);}});
router.post("/guru",(req,res,next)=>{try{res.status(201).json(svc.createGuru(req.body||{}));}catch(e){next(e);}});
router.put("/guru/:id",(req,res,next)=>{try{res.json(svc.updateGuru(req.params.id,req.body||{}));}catch(e){next(e);}});
router.delete("/guru/:id",(req,res,next)=>{try{res.json(svc.deleteGuru(req.params.id));}catch(e){next(e);}});

router.get("/wali",(req,res,next)=>{try{res.json(svc.listWali());}catch(e){next(e);}});
router.post("/wali",(req,res,next)=>{try{res.status(201).json(svc.createWali(req.body||{}));}catch(e){next(e);}});
router.put("/wali/:id",(req,res,next)=>{try{res.json(svc.updateWali(req.params.id,req.body||{}));}catch(e){next(e);}});
router.delete("/wali/:id",(req,res,next)=>{try{res.json(svc.deleteWali(req.params.id));}catch(e){next(e);}});

router.get("/santri",(req,res,next)=>{try{res.json(svc.listSantri());}catch(e){next(e);}});
router.post("/santri",(req,res,next)=>{try{res.status(201).json(svc.upsertSantri(req.body||{}));}catch(e){next(e);}});
router.put("/santri/:id",(req,res,next)=>{try{res.json(svc.upsertSantri({...req.body,id:req.params.id}));}catch(e){next(e);}});
router.delete("/santri/:id",(req,res,next)=>{try{res.json(svc.deleteSantri(req.params.id));}catch(e){next(e);}});

router.get("/config/:key",(req,res,next)=>{try{res.json({key:req.params.key,value:svc.getConfig(req.params.key)});}catch(e){next(e);}});
router.put("/config/:key",(req,res,next)=>{try{res.json({key:req.params.key,value:svc.setConfig(req.params.key,req.body?.value)});}catch(e){next(e);}});

module.exports=router;
