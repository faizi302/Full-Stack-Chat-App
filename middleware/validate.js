// middleware/validate.js
import Joi from "joi";

export const signupSchema = Joi.object({
  fullName: Joi.string().min(2).max(50).required().messages({
    "string.min": "Full name must be at least 2 characters",
    "any.required": "Full name is required",
  }),
  email: Joi.string().email().required().messages({
    "string.email": "Please enter a valid email",
    "any.required": "Email is required",
  }),
  password: Joi.string().min(6).required().messages({
    "string.min": "Password must be at least 6 characters",
    "any.required": "Password is required",
  }),
  nickName: Joi.string().min(2).max(30).required().messages({
    "string.min": "Nickname must be at least 2 characters",
    "any.required": "Nickname is required",
  }),
  // profileImage is optional — sent after Cloudinary upload during signup
  profileImage: Joi.string().uri().allow("").optional(),
});

export const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
});

export const updateProfileSchema = Joi.object({
  fullName:     Joi.string().min(2).max(50),
  nickName:     Joi.string().min(2).max(30),
  profileImage: Joi.string().uri().allow(""),
}).min(1);

// Middleware factory
export const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false, allowUnknown: false });
  if (error) {
    const messages = error.details.map((d) => d.message);
    return res.status(400).json({ message: messages[0], errors: messages });
  }
  next();
};